// Установщик и лаунчер MIR для Windows.
//
// Этот файл компилируется сборщиком build-exe.mjs штатным компилятором C#
// (C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe), который есть в
// составе .NET Framework на любой Windows 10/11 — ничего ставить не нужно.
//
// Один и тот же exe работает в трёх режимах:
//   без аргументов   — окно установщика (или сразу игра, если запущена копия
//                      из папки установки);
//   --play           — запустить игру (так работают ярлыки);
//   --install        — тихая установка;
//   --uninstall      — удаление.
//
// Игра отдаётся не через file://, а крошечным локальным сервером на
// 127.0.0.1. Это важно: по file:// браузеры запрещают localStorage и
// service worker, то есть аккаунты и офлайн-режим просто не работали бы.
// Порт фиксированный, чтобы origin (а с ним и сохранённые аккаунты) не
// менялся от запуска к запуску.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

// Свойства файла в проводнике Windows: без них exe выглядит «пустым».
[assembly: AssemblyTitle("MIR — The civilization of the sages")]
[assembly: AssemblyDescription("Офлайн-игра и общий хаб для друзей")]
[assembly: AssemblyProduct("MIR")]
[assembly: AssemblyCompany("MIR")]
[assembly: AssemblyCopyright("MIR")]
[assembly: AssemblyVersion("0.3.0.0")]
[assembly: AssemblyFileVersion("0.3.0.0")]

namespace Mir
{
    internal static class Branding
    {
        public const string AppName = "MIR";
        public const string FullName = "MIR — The civilization of the sages";
        public const string Version = "0.3.0";
        public const int BasePort = 47821;
        public const int PortAttempts = 12;

        public static readonly Color Background = Color.FromArgb(8, 8, 10);
        public static readonly Color Foreground = Color.FromArgb(237, 237, 240);
        public static readonly Color Muted = Color.FromArgb(139, 139, 148);
        public static readonly Color Line = Color.FromArgb(39, 39, 42);
        public static readonly Color Panel = Color.FromArgb(20, 20, 24);
    }

    /// <summary>Встроенные в exe файлы сайта и иконка.</summary>
    internal static class Payload
    {
        public static Dictionary<string, byte[]> LoadSite()
        {
            Dictionary<string, byte[]> files = new Dictionary<string, byte[]>(StringComparer.OrdinalIgnoreCase);
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("mir.site"))
            {
                if (stream == null) throw new InvalidOperationException("В установщике нет файлов игры.");
                using (BinaryReader reader = new BinaryReader(stream))
                {
                    int count = reader.ReadInt32();
                    for (int i = 0; i < count; i++)
                    {
                        int nameLength = reader.ReadUInt16();
                        string name = Encoding.UTF8.GetString(reader.ReadBytes(nameLength));
                        int rawLength = reader.ReadInt32();
                        int packedLength = reader.ReadInt32();
                        byte[] packed = reader.ReadBytes(packedLength);
                        files[name] = Inflate(packed, rawLength);
                    }
                }
            }
            return files;
        }

        public static byte[] LoadIcon()
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("mir.icon"))
            {
                if (stream == null) return new byte[0];
                using (MemoryStream memory = new MemoryStream())
                {
                    stream.CopyTo(memory);
                    return memory.ToArray();
                }
            }
        }

        private static byte[] Inflate(byte[] packed, int rawLength)
        {
            byte[] result = new byte[rawLength];
            using (MemoryStream source = new MemoryStream(packed))
            using (DeflateStream inflater = new DeflateStream(source, CompressionMode.Decompress))
            {
                int read = 0;
                while (read < rawLength)
                {
                    int chunk = inflater.Read(result, read, rawLength - read);
                    if (chunk <= 0) break;
                    read += chunk;
                }
            }
            return result;
        }
    }

    /// <summary>Локальный http-сервер на 127.0.0.1 — отдаёт встроенный сайт.</summary>
    internal sealed class LocalSite
    {
        private readonly Dictionary<string, byte[]> files;
        private TcpListener listener;
        private volatile bool running;

        public int Port { get; private set; }

        public LocalSite(Dictionary<string, byte[]> files)
        {
            this.files = files;
        }

        /// <summary>Ищет уже запущенный экземпляр игры. Возвращает порт или 0.</summary>
        public static int FindRunning()
        {
            for (int i = 0; i < Branding.PortAttempts; i++)
            {
                int port = Branding.BasePort + i;
                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(
                        "http://127.0.0.1:" + port.ToString(CultureInfo.InvariantCulture) + "/mir-ping");
                    request.Timeout = 400;
                    request.ReadWriteTimeout = 400;
                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        if (reader.ReadToEnd().StartsWith("MIR")) return port;
                    }
                }
                catch
                {
                    // порт свободен или занят чем-то чужим — просто идём дальше
                }
            }
            return 0;
        }

        public bool Start()
        {
            for (int i = 0; i < Branding.PortAttempts; i++)
            {
                int port = Branding.BasePort + i;
                try
                {
                    listener = new TcpListener(IPAddress.Loopback, port);
                    listener.Start();
                    Port = port;
                    running = true;
                    Thread thread = new Thread(Loop);
                    thread.IsBackground = true;
                    thread.Start();
                    return true;
                }
                catch (SocketException)
                {
                    listener = null;
                }
            }
            return false;
        }

        public void Stop()
        {
            running = false;
            try
            {
                if (listener != null) listener.Stop();
            }
            catch
            {
            }
        }

        public string Url
        {
            get { return "http://127.0.0.1:" + Port.ToString(CultureInfo.InvariantCulture) + "/"; }
        }

        private void Loop()
        {
            while (running)
            {
                TcpClient client = null;
                try
                {
                    client = listener.AcceptTcpClient();
                }
                catch
                {
                    return;
                }

                TcpClient captured = client;
                Thread worker = new Thread(delegate() { Handle(captured); });
                worker.IsBackground = true;
                worker.Start();
            }
        }

        private void Handle(TcpClient client)
        {
            try
            {
                using (client)
                {
                    client.ReceiveTimeout = 5000;
                    client.SendTimeout = 15000;
                    using (NetworkStream stream = client.GetStream())
                    {
                        string requestLine = ReadLine(stream);
                        if (string.IsNullOrEmpty(requestLine)) return;
                        while (true)
                        {
                            string header = ReadLine(stream);
                            if (header == null || header.Length == 0) break;
                        }

                        string[] parts = requestLine.Split(' ');
                        if (parts.Length < 2)
                        {
                            Respond(stream, "400 Bad Request", "text/plain", new byte[0]);
                            return;
                        }

                        string path = parts[1];
                        int query = path.IndexOf('?');
                        if (query >= 0) path = path.Substring(0, query);
                        path = Uri.UnescapeDataString(path);

                        if (path == "/mir-ping")
                        {
                            Respond(stream, "200 OK", "text/plain", Encoding.ASCII.GetBytes("MIR " + Branding.Version));
                            return;
                        }

                        if (path.EndsWith("/")) path += "index.html";
                        string key = path.TrimStart('/');

                        byte[] body;
                        if (files.TryGetValue(key, out body))
                            Respond(stream, "200 OK", ContentType(key), body);
                        else if (files.TryGetValue("index.html", out body))
                            Respond(stream, "200 OK", "text/html; charset=utf-8", body); // SPA-поведение
                        else
                            Respond(stream, "404 Not Found", "text/plain", Encoding.UTF8.GetBytes("Нет такого файла"));
                    }
                }
            }
            catch
            {
                // Обрыв соединения браузером — нормальная ситуация, молчим.
            }
        }

        private static string ReadLine(Stream stream)
        {
            StringBuilder line = new StringBuilder();
            while (true)
            {
                int value = stream.ReadByte();
                if (value < 0) return line.Length == 0 ? null : line.ToString();
                if (value == '\n') return line.ToString().TrimEnd('\r');
                line.Append((char)value);
                if (line.Length > 8192) return line.ToString();
            }
        }

        private static void Respond(Stream stream, string status, string contentType, byte[] body)
        {
            StringBuilder head = new StringBuilder();
            head.Append("HTTP/1.1 ").Append(status).Append("\r\n");
            head.Append("Content-Type: ").Append(contentType).Append("\r\n");
            head.Append("Content-Length: ").Append(body.Length.ToString(CultureInfo.InvariantCulture)).Append("\r\n");
            head.Append("Cache-Control: no-cache\r\n");
            head.Append("Connection: close\r\n\r\n");
            byte[] headBytes = Encoding.ASCII.GetBytes(head.ToString());
            stream.Write(headBytes, 0, headBytes.Length);
            if (body.Length > 0) stream.Write(body, 0, body.Length);
            stream.Flush();
        }

        private static string ContentType(string path)
        {
            string lower = path.ToLowerInvariant();
            if (lower.EndsWith(".html")) return "text/html; charset=utf-8";
            if (lower.EndsWith(".js")) return "text/javascript; charset=utf-8";
            if (lower.EndsWith(".css")) return "text/css; charset=utf-8";
            if (lower.EndsWith(".json")) return "application/json; charset=utf-8";
            if (lower.EndsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
            if (lower.EndsWith(".png")) return "image/png";
            if (lower.EndsWith(".jpg") || lower.EndsWith(".jpeg")) return "image/jpeg";
            if (lower.EndsWith(".svg")) return "image/svg+xml";
            if (lower.EndsWith(".ico")) return "image/x-icon";
            if (lower.EndsWith(".woff2")) return "font/woff2";
            return "application/octet-stream";
        }
    }

    /// <summary>Поиск браузера и запуск игры в окне без адресной строки.</summary>
    internal static class Browser
    {
        public static Process Open(string url, string profileDir)
        {
            string browser = Find();
            if (browser != null)
            {
                try
                {
                    Directory.CreateDirectory(profileDir);
                    ProcessStartInfo info = new ProcessStartInfo();
                    info.FileName = browser;
                    info.Arguments = "--app=" + url
                        + " --user-data-dir=\"" + profileDir + "\""
                        + " --no-first-run --no-default-browser-check --disable-background-mode"
                        + " --window-size=1280,860";
                    info.UseShellExecute = false;
                    return Process.Start(info);
                }
                catch
                {
                    // не получилось — откроем в браузере по умолчанию
                }
            }

            try
            {
                Process.Start(url);
            }
            catch
            {
            }
            return null;
        }

        private static string Find()
        {
            string[] names = new string[] { "msedge.exe", "chrome.exe", "brave.exe", "vivaldi.exe", "opera.exe" };
            foreach (string name in names)
            {
                string path = FromAppPaths(Registry.CurrentUser, name);
                if (path == null) path = FromAppPaths(Registry.LocalMachine, name);
                if (path != null && File.Exists(path)) return path;
            }

            string[] guesses = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
            };
            foreach (string guess in guesses)
            {
                if (File.Exists(guess)) return guess;
            }
            return null;
        }

        private static string FromAppPaths(RegistryKey root, string exeName)
        {
            try
            {
                using (RegistryKey key = root.OpenSubKey(
                    @"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exeName))
                {
                    if (key == null) return null;
                    object value = key.GetValue(null);
                    return value == null ? null : value.ToString().Trim('"');
                }
            }
            catch
            {
                return null;
            }
        }
    }

    internal static class Paths
    {
        public static string InstallDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"Programs\MIR");
            }
        }

        public static string DataDir
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    @"MIR");
            }
        }

        public static string SelfPath
        {
            get { return Assembly.GetExecutingAssembly().Location; }
        }

        public static bool RunningInstalled
        {
            get
            {
                try
                {
                    return string.Equals(
                        Path.GetDirectoryName(SelfPath),
                        InstallDir,
                        StringComparison.OrdinalIgnoreCase);
                }
                catch
                {
                    return false;
                }
            }
        }
    }

    internal static class Setup
    {
        private const string UninstallKey =
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall\MIR-TheCivilizationOfTheSages";

        public static string Install()
        {
            string dir = Paths.InstallDir;
            Directory.CreateDirectory(dir);
            Directory.CreateDirectory(Paths.DataDir);

            string exe = Path.Combine(dir, "MIR.exe");
            if (!string.Equals(Paths.SelfPath, exe, StringComparison.OrdinalIgnoreCase))
                File.Copy(Paths.SelfPath, exe, true);

            string icon = Path.Combine(dir, "app.ico");
            byte[] iconBytes = Payload.LoadIcon();
            if (iconBytes.Length > 0) File.WriteAllBytes(icon, iconBytes);
            else icon = exe;

            string desktop = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "MIR.lnk");
            CreateShortcut(desktop, exe, "--play", dir, icon);

            string startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.Programs), "MIR.lnk");
            CreateShortcut(startMenu, exe, "--play", dir, icon);

            RegisterUninstall(dir, exe, icon);
            return exe;
        }

        public static void Uninstall()
        {
            string dir = Paths.InstallDir;
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "MIR.lnk"));
            TryDelete(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "MIR.lnk"));

            try
            {
                Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false);
            }
            catch
            {
            }

            // Удалить собственный exe на ходу нельзя — просим это сделать cmd после выхода.
            try
            {
                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = "cmd.exe";
                info.Arguments = "/c ping -n 3 127.0.0.1 >nul & rmdir /s /q \"" + dir + "\"";
                info.CreateNoWindow = true;
                info.UseShellExecute = false;
                Process.Start(info);
            }
            catch
            {
            }
        }

        private static void TryDelete(string path)
        {
            try
            {
                if (File.Exists(path)) File.Delete(path);
            }
            catch
            {
            }
        }

        private static void RegisterUninstall(string dir, string exe, string icon)
        {
            try
            {
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(UninstallKey))
                {
                    if (key == null) return;
                    key.SetValue("DisplayName", Branding.FullName);
                    key.SetValue("DisplayVersion", Branding.Version);
                    key.SetValue("DisplayIcon", icon);
                    key.SetValue("Publisher", "MIR");
                    key.SetValue("InstallLocation", dir);
                    key.SetValue("UninstallString", "\"" + exe + "\" --uninstall");
                    key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                    key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                }
            }
            catch
            {
            }
        }

        private static void CreateShortcut(string linkPath, string target, string arguments, string workDir, string icon)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                object shell = Activator.CreateInstance(shellType);
                object link = shellType.InvokeMember("CreateShortcut",
                    BindingFlags.InvokeMethod, null, shell, new object[] { linkPath });
                Type linkType = link.GetType();
                linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
                linkType.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { arguments });
                linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { workDir });
                linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { Branding.FullName });
                linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { icon + ",0" });
                linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, new object[0]);
            }
            catch
            {
                // Без ярлыка жить можно: игра всё равно установлена.
            }
        }
    }

    internal static class Ui
    {
        public static Label Text(string value, int x, int y, int width, int height, Color color, float size, FontStyle style)
        {
            Label label = new Label();
            label.Text = value;
            label.Location = new Point(x, y);
            label.Size = new Size(width, height);
            label.ForeColor = color;
            label.Font = new Font("Segoe UI", size, style);
            label.BackColor = Color.Transparent;
            return label;
        }

        public static Button Action(string value, int x, int y, int width, int height, bool primary)
        {
            Button button = new Button();
            button.Text = value;
            button.Location = new Point(x, y);
            button.Size = new Size(width, height);
            button.FlatStyle = FlatStyle.Flat;
            button.Cursor = Cursors.Hand;
            button.UseVisualStyleBackColor = false;
            if (primary)
            {
                button.BackColor = Branding.Foreground;
                button.ForeColor = Branding.Background;
                button.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
                button.FlatAppearance.BorderSize = 0;
            }
            else
            {
                button.BackColor = Branding.Panel;
                button.ForeColor = Color.FromArgb(161, 161, 170);
                button.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
                button.FlatAppearance.BorderColor = Branding.Line;
            }
            return button;
        }

        public static void ApplyIcon(Form form)
        {
            try
            {
                byte[] bytes = Payload.LoadIcon();
                if (bytes.Length > 0)
                {
                    using (MemoryStream memory = new MemoryStream(bytes))
                    {
                        form.Icon = new Icon(memory);
                    }
                }
            }
            catch
            {
            }
        }
    }

    /// <summary>Окно установщика.</summary>
    public sealed class SetupForm : Form
    {
        private readonly Label status;

        /// <summary>Запустить игру после закрытия окна (режим «без установки»).</summary>
        public bool PlayAfterClose;

        public SetupForm()
        {
            Text = Branding.FullName;
            ClientSize = new Size(520, 340);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Branding.Background;
            ForeColor = Branding.Foreground;
            Font = new Font("Segoe UI", 9.75f);
            Ui.ApplyIcon(this);

            Controls.Add(Ui.Text("THE CIVILIZATION", 32, 28, 440, 30, Branding.Foreground, 16f, FontStyle.Bold));
            Controls.Add(Ui.Text("OF THE SAGES", 32, 56, 440, 30, Branding.Foreground, 16f, FontStyle.Bold));
            Controls.Add(Ui.Text("Установка игры на компьютер", 34, 96, 440, 22, Branding.Muted, 10f, FontStyle.Regular));

            Button install = Ui.Action("УСТАНОВИТЬ НА КОМПЬЮТЕР", 32, 134, 456, 46, true);
            install.Click += OnInstall;
            Controls.Add(install);

            Controls.Add(Ui.Text(
                "Ярлык на рабочем столе и в меню «Пуск». Игра запускается в отдельном\nокне без адресной строки и работает без интернета.",
                34, 186, 456, 38, Color.FromArgb(113, 113, 122), 8.5f, FontStyle.Regular));

            Button portable = Ui.Action("Просто поиграть, без установки", 32, 232, 456, 38, false);
            portable.Click += OnPortable;
            Controls.Add(portable);

            status = Ui.Text("Версия " + Branding.Version + " • офлайн-игра и общий хаб для друзей",
                34, 288, 456, 34, Color.FromArgb(82, 82, 91), 8.5f, FontStyle.Regular);
            Controls.Add(status);
        }

        private void OnInstall(object sender, EventArgs e)
        {
            try
            {
                status.Text = "Устанавливаю…";
                Application.DoEvents();
                string exe = Setup.Install();

                ProcessStartInfo info = new ProcessStartInfo();
                info.FileName = exe;
                info.Arguments = "--play";
                info.WorkingDirectory = Paths.InstallDir;
                info.UseShellExecute = false;
                Process.Start(info);

                MessageBox.Show(
                    "MIR установлен.\n\nЯрлык появился на рабочем столе и в меню «Пуск».\nИгра уже запускается — приятной игры!",
                    "Готово", MessageBoxButtons.OK, MessageBoxIcon.Information);
                Close();
            }
            catch (Exception error)
            {
                status.Text = "Не получилось: " + error.Message;
                MessageBox.Show("Не удалось установить игру:\n\n" + error.Message,
                    "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnPortable(object sender, EventArgs e)
        {
            /* Игру запускаем уже после закрытия окна: второй цикл сообщений
               в одном потоке WinForms запускать нельзя. */
            PlayAfterClose = true;
            Close();
        }
    }

    /// <summary>Окно «игра работает» — показывается, если Chromium-браузера нет.</summary>
    public sealed class RunningForm : Form
    {
        private readonly LocalSite site;
        private readonly string url;

        public RunningForm(LocalSite site, string url)
        {
            this.site = site;
            this.url = url;

            Text = Branding.FullName;
            ClientSize = new Size(460, 200);
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Branding.Background;
            ForeColor = Branding.Foreground;
            Ui.ApplyIcon(this);

            Controls.Add(Ui.Text("Игра запущена в браузере", 28, 26, 400, 26, Branding.Foreground, 13f, FontStyle.Bold));
            Controls.Add(Ui.Text("Адрес: " + url, 30, 60, 400, 22, Branding.Muted, 9.5f, FontStyle.Regular));
            Controls.Add(Ui.Text("Не закрывайте это окно, пока играете.", 30, 84, 400, 22,
                Color.FromArgb(113, 113, 122), 9f, FontStyle.Regular));

            Button again = Ui.Action("Открыть ещё раз", 28, 120, 200, 40, false);
            again.Click += delegate { Browser.Open(url, Path.Combine(Paths.DataDir, "Profile")); };
            Controls.Add(again);

            Button stop = Ui.Action("Остановить игру", 240, 120, 192, 40, true);
            stop.Click += delegate { Close(); };
            Controls.Add(stop);
        }

        protected override void OnFormClosed(FormClosedEventArgs e)
        {
            site.Stop();
            base.OnFormClosed(e);
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            string mode = args.Length > 0 ? args[0] : string.Empty;

            if (mode == "--uninstall")
            {
                DialogResult answer = MessageBox.Show(
                    "Удалить MIR с этого компьютера?\n\nСохранённые аккаунты в профиле игры тоже останутся на диске —\nудалите папку MIR в %LOCALAPPDATA%, если они больше не нужны.",
                    "Удаление MIR", MessageBoxButtons.YesNo, MessageBoxIcon.Question);
                if (answer == DialogResult.Yes) Setup.Uninstall();
                return;
            }

            if (mode == "--install")
            {
                try
                {
                    Setup.Install();
                }
                catch (Exception error)
                {
                    MessageBox.Show("Не удалось установить игру:\n\n" + error.Message,
                        "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                return;
            }

            if (mode == "--play" || Paths.RunningInstalled)
            {
                Play();
                return;
            }

            SetupForm setup = new SetupForm();
            Application.Run(setup);
            if (setup.PlayAfterClose) Play();
        }

        public static void Play()
        {
            string profile = Path.Combine(Paths.DataDir, "Profile");

            int running = LocalSite.FindRunning();
            if (running > 0)
            {
                // Игра уже запущена: просто открываем ещё одно окно на том же порту.
                Browser.Open("http://127.0.0.1:" + running.ToString(CultureInfo.InvariantCulture) + "/", profile);
                return;
            }

            LocalSite site;
            try
            {
                site = new LocalSite(Payload.LoadSite());
            }
            catch (Exception error)
            {
                MessageBox.Show("Не удалось распаковать игру:\n\n" + error.Message,
                    "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            if (!site.Start())
            {
                MessageBox.Show(
                    "Не удалось занять локальный порт для игры.\nЗакройте другие копии игры и попробуйте снова.",
                    "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Process browser = Browser.Open(site.Url, profile);
            if (browser == null)
            {
                Application.Run(new RunningForm(site, site.Url));
                return;
            }

            try
            {
                browser.WaitForExit();
            }
            catch
            {
            }
            site.Stop();
        }
    }
}
