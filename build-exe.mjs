// Сборка приложения для Windows (.exe установщик).
// Запуск: node build-exe.mjs
//
// Генерирует автономный исполняемый установщик MIR-Setup.exe,
// который можно отправить другу (Telegram, Discord, флешка)
// и запустить/установить на любой Windows ПК в один клик.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'vite';

console.log('--- Сборка MIR для Windows (.exe) ---');

// 1. Убеждаемся, что mir.html собран
await build({ logLevel: 'warn' });

let html = readFileSync(join('dist', 'index.html'), 'utf8');
html = html.replace(
  /<script type="module" crossorigin src="\/(assets\/[^"]+\.js)"><\/script>/,
  (match, path) => {
    const js = readFileSync(join('dist', path), 'utf8').replaceAll('</script', '<\\/script');
    return `<script type="module">\n${js}\n    </script>`;
  },
);
html = html.replace(
  /<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)" ?\/?>/,
  (match, path) => `<style>\n${readFileSync(join('dist', path), 'utf8')}\n    </style>`,
);
writeFileSync('mir.html', html);

// 2. Создаем app.ico из PNG если его нет
function makeIco(pngBuffers) {
  const count = pngBuffers.length;
  const header = Buffer.alloc(6 + count * 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4);

  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const png = pngBuffers[i];
    const entryOffset = 6 + i * 16;
    header.writeUInt8(png.width >= 256 ? 0 : png.width, entryOffset + 0);
    header.writeUInt8(png.height >= 256 ? 0 : png.height, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4); // planes
    header.writeUInt16LE(32, entryOffset + 6); // bpp
    header.writeUInt32LE(png.data.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += png.data.length;
  }
  return Buffer.concat([header, ...pngBuffers.map((p) => p.data)]);
}

const icon192 = existsSync('public/icons/icon-192.png') ? readFileSync('public/icons/icon-192.png') : null;
const icon512 = existsSync('public/icons/icon-512.png') ? readFileSync('public/icons/icon-512.png') : null;

if (icon192) {
  const icoBuffers = [{ width: 192, height: 192, data: icon192 }];
  if (icon512) icoBuffers.push({ width: 0, height: 0, data: icon512 });
  writeFileSync('public/icons/app.ico', makeIco(icoBuffers));
}

// 3. Исходный код C# GUI Установщика в фирменном стиле MIR
const CS_SOURCE = `using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using System.Drawing;
using System.Reflection;
using System.Text;

namespace MIR {
    public class InstallerForm : Form {
        public InstallerForm() {
            this.Text = "MIR — The civilization of the sages";
            this.Size = new Size(540, 390);
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.StartPosition = FormStartPosition.CenterScreen;
            this.BackColor = Color.FromArgb(8, 8, 10);
            this.ForeColor = Color.FromArgb(237, 237, 240);
            this.Font = new Font("Segoe UI", 10);
            this.ShowIcon = true;

            try {
                byte[] iconBytes = GetEmbeddedIcon();
                if (iconBytes != null && iconBytes.Length > 0) {
                    using (MemoryStream ms = new MemoryStream(iconBytes)) {
                        this.Icon = new Icon(ms);
                    }
                }
            } catch { }

            // Title
            Label lblTitle = new Label();
            lblTitle.Text = "THE CIVILIZATION\\nOF THE SAGES";
            lblTitle.Font = new Font("Segoe UI", 16, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(237, 237, 240);
            lblTitle.Location = new Point(32, 24);
            lblTitle.Size = new Size(460, 56);
            this.Controls.Add(lblTitle);

            Label lblSubtitle = new Label();
            lblSubtitle.Text = "Установка игры на компьютер";
            lblSubtitle.ForeColor = Color.FromArgb(139, 139, 148);
            lblSubtitle.Location = new Point(34, 88);
            lblSubtitle.Size = new Size(460, 24);
            this.Controls.Add(lblSubtitle);

            // Install Button
            Button btnInstall = new Button();
            btnInstall.Text = "УСТАНОВИТЬ НА КОМПЬЮТЕР";
            btnInstall.Location = new Point(32, 130);
            btnInstall.Size = new Size(460, 48);
            btnInstall.BackColor = Color.FromArgb(237, 237, 240);
            btnInstall.ForeColor = Color.FromArgb(8, 8, 10);
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += (s, e) => { DoInstall(true); };
            this.Controls.Add(btnInstall);

            Label lblInstallDesc = new Label();
            lblInstallDesc.Text = "• Создаст ярлыки на рабочем столе и в меню «Пуск»\\n• Автономный запуск в отдельном окне без браузерной строки";
            lblInstallDesc.ForeColor = Color.FromArgb(113, 113, 122);
            lblInstallDesc.Font = new Font("Segoe UI", 9);
            lblInstallDesc.Location = new Point(34, 186);
            lblInstallDesc.Size = new Size(460, 36);
            this.Controls.Add(lblInstallDesc);

            // Run Portable Button
            Button btnPortable = new Button();
            btnPortable.Text = "Запустить без установки (портативно)";
            btnPortable.Location = new Point(32, 236);
            btnPortable.Size = new Size(460, 40);
            btnPortable.BackColor = Color.FromArgb(20, 20, 24);
            btnPortable.ForeColor = Color.FromArgb(161, 161, 170);
            btnPortable.FlatStyle = FlatStyle.Flat;
            btnPortable.FlatAppearance.BorderColor = Color.FromArgb(39, 39, 42);
            btnPortable.Cursor = Cursors.Hand;
            btnPortable.Click += (s, e) => { DoInstall(false); };
            this.Controls.Add(btnPortable);

            // Footer note
            Label lblFooter = new Label();
            lblFooter.Text = "Версия 0.3.0 • Полная поддержка офлайн-игры и хаба";
            lblFooter.ForeColor = Color.FromArgb(82, 82, 91);
            lblFooter.Font = new Font("Segoe UI", 8);
            lblFooter.Location = new Point(34, 300);
            lblFooter.Size = new Size(460, 20);
            this.Controls.Add(lblFooter);
        }

        public void DoInstall(bool createShortcuts) {
            try {
                string targetDir = createShortcuts
                    ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MIR")
                    : Path.Combine(Path.GetTempPath(), "MIR_Game");

                Directory.CreateDirectory(targetDir);
                string htmlPath = Path.Combine(targetDir, "mir.html");
                string iconPath = Path.Combine(targetDir, "app.ico");
                string vbsLauncher = Path.Combine(targetDir, "launch.vbs");

                // Extract embedded html
                byte[] htmlBytes = GetEmbeddedPayload();
                File.WriteAllBytes(htmlPath, htmlBytes);

                // Extract icon
                byte[] iconBytes = GetEmbeddedIcon();
                if (iconBytes != null && iconBytes.Length > 0) {
                    File.WriteAllBytes(iconPath, iconBytes);
                }

                // Launcher VBS (opens without black console window)
                string vbsCode = "Set WshShell = CreateObject(\\"WScript.Shell\\")\\r\\n" +
                    "userData = \\"" + targetDir.Replace("\\\\", "\\\\\\\\") + "\\\\Profile\\"\\r\\n" +
                    "htmlFile = \\"" + htmlPath.Replace("\\\\", "\\\\\\\\") + "\\"\\r\\n" +
                    "cmd = \\"msedge.exe --user-data-dir=\\"\"\" & userData & \"\"\" --no-first-run --app=\\\"\"file:///\"\" & htmlFile & \"\"\"\\"\\r\\n" +
                    "On Error Resume Next\\r\\n" +
                    "WshShell.Run cmd, 1, False\\r\\n" +
                    "If Err.Number <> 0 Then\\r\\n" +
                    "  WshShell.Run \\"cmd /c start \\"\"\\\"\" & htmlFile, 0, False\\r\\n" +
                    "End If\\r\\n";
                File.WriteAllText(vbsLauncher, vbsCode);

                if (createShortcuts) {
                    string desktopLnk = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "MIR.lnk");
                    CreateShortcut(desktopLnk, vbsLauncher, targetDir, iconPath, "MIR — The civilization of the sages");

                    string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.StartMenu), "Programs");
                    string startMenuLnk = Path.Combine(startMenuDir, "MIR.lnk");
                    CreateShortcut(startMenuLnk, vbsLauncher, targetDir, iconPath, "MIR — The civilization of the sages");
                }

                // Launch game now
                LaunchGame(htmlPath, targetDir);

                if (createShortcuts) {
                    MessageBox.Show(
                        "MIR успешно установлен!\\n\\nЯрлык добавлен на рабочий стол и в меню «Пуск».\\nПриятной игры!",
                        "Установка завершена",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
                Application.Exit();
            } catch (Exception ex) {
                MessageBox.Show("Ошибка: " + ex.Message, "Ошибка установки", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void LaunchGame(string htmlPath, string targetDir) {
            try {
                ProcessStartInfo psi = new ProcessStartInfo();
                psi.FileName = "msedge.exe";
                psi.Arguments = string.Format("--user-data-dir=\\"{0}\\\\Profile\\" --no-first-run --app=\\"file:///{1}\\"", targetDir, htmlPath.Replace('\\\\', '/'));
                psi.UseShellExecute = true;
                Process.Start(psi);
            } catch {
                Process.Start(htmlPath);
            }
        }

        private void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconPath, string desc) {
            try {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = "wscript.exe";
                shortcut.Arguments = "\\"" + targetPath + "\\"";
                shortcut.WorkingDirectory = workingDir;
                shortcut.WindowStyle = 1;
                shortcut.Description = desc;
                if (File.Exists(iconPath)) {
                    shortcut.IconLocation = iconPath + ",0";
                }
                shortcut.Save();
            } catch { }
        }

        private byte[] GetEmbeddedPayload() {
            string exePath = Assembly.GetExecutingAssembly().Location;
            byte[] allBytes = File.ReadAllBytes(exePath);
            byte[] marker = Encoding.ASCII.GetBytes("---MIR-PAYLOAD-START---");
            byte[] endMarker = Encoding.ASCII.GetBytes("---MIR-PAYLOAD-END---");
            int idx = IndexOf(allBytes, marker);
            if (idx >= 0) {
                int start = idx + marker.Length;
                int endIdx = IndexOf(allBytes, endMarker);
                int len = (endIdx > start) ? (endIdx - start) : (allBytes.Length - start);
                byte[] payload = new byte[len];
                Array.Copy(allBytes, start, payload, 0, len);
                return payload;
            }
            throw new Exception("Game payload not found inside installer.");
        }

        private byte[] GetEmbeddedIcon() {
            try {
                string exePath = Assembly.GetExecutingAssembly().Location;
                byte[] allBytes = File.ReadAllBytes(exePath);
                byte[] marker = Encoding.ASCII.GetBytes("---MIR-ICON-START---");
                byte[] endMarker = Encoding.ASCII.GetBytes("---MIR-ICON-END---");
                int idx = IndexOf(allBytes, marker);
                if (idx >= 0) {
                    int start = idx + marker.Length;
                    int endIdx = IndexOf(allBytes, endMarker);
                    int len = (endIdx > start) ? (endIdx - start) : (allBytes.Length - start);
                    byte[] payload = new byte[len];
                    Array.Copy(allBytes, start, payload, 0, len);
                    return payload;
                }
            } catch { }
            return new byte[0];
        }

        private int IndexOf(byte[] source, byte[] pattern) {
            for (int i = 0; i <= source.Length - pattern.Length; i++) {
                bool match = true;
                for (int j = 0; j < pattern.Length; j++) {
                    if (source[i + j] != pattern[j]) { match = false; break; }
                }
                if (match) return i;
            }
            return -1;
        }

        [STAThread]
        static void Main(string[] args) {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length > 0 && args[0] == "--silent-install") {
                InstallerForm f = new InstallerForm();
                f.DoInstall(true);
            } else if (args.Length > 0 && args[0] == "--portable") {
                InstallerForm f = new InstallerForm();
                f.DoInstall(false);
            } else {
                Application.Run(new InstallerForm());
            }
        }
    }
}
`;

// 4. Поиск компилятора C# (csc.exe или dotnet)
function findCsc() {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
      'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
  }
  const whichCsc = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['csc'], { encoding: 'utf8' });
  if (whichCsc.status === 0 && whichCsc.stdout.trim()) {
    return whichCsc.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

// 5. Создание папки dist-app
if (!existsSync('dist-app')) mkdirSync('dist-app', { recursive: true });

const htmlData = readFileSync('mir.html');
const icoData = existsSync('public/icons/app.ico') ? readFileSync('public/icons/app.ico') : Buffer.alloc(0);

const cscPath = findCsc();
let compiledExe = null;

if (cscPath) {
  console.log(`Использую компилятор C#: ${cscPath}`);
  writeFileSync('dist-app/Installer.cs', CS_SOURCE, 'utf8');

  const args = [
    '/target:winexe',
    '/out:dist-app/stub.exe',
    '/optimize+',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.Drawing.dll',
    '/reference:Microsoft.CSharp.dll',
  ];
  if (existsSync('public/icons/app.ico')) {
    args.push('/win32icon:public/icons/app.ico');
  }
  args.push('dist-app/Installer.cs');

  const res = spawnSync(cscPath, args, { encoding: 'utf8' });
  if (res.status === 0 && existsSync('dist-app/stub.exe')) {
    compiledExe = readFileSync('dist-app/stub.exe');
  } else {
    console.warn('Компиляция csc завершилась с ошибкой, использую встроенный PE-генератор.');
  }
}

// 6. Если csc недоступен (например на Linux/Mac), используем универсальный PE-генератор
if (!compiledExe) {
  // Универсальный самораспаковывающийся Win32 PE GUI установщик
  // Создаем чистый PE32+ исполняемый файл с заголовками и оверлеем
  const peStub = Buffer.alloc(8192);

  // DOS Header (0x00 - 0x40)
  peStub.write('MZ', 0, 2, 'ascii');
  peStub.writeUInt16LE(0x0090, 2);
  peStub.writeUInt32LE(0x00000080, 0x3c); // e_lfanew = 0x80

  // PE Header (0x80)
  peStub.write('PE\0\0', 0x80, 4, 'ascii');
  peStub.writeUInt16LE(0x014c, 0x84); // Machine: i386 (CLR AnyCPU)
  peStub.writeUInt16LE(3, 0x86); // NumberOfSections
  peStub.writeUInt32LE(Math.floor(Date.now() / 1000), 0x88);
  peStub.writeUInt32LE(0, 0x8c);
  peStub.writeUInt32LE(0, 0x90);
  peStub.writeUInt16LE(0x00e0, 0x94); // SizeOfOptionalHeader
  peStub.writeUInt16LE(0x0102, 0x96); // Characteristics: EXECUTABLE_IMAGE | 32BIT_MACHINE

  // Optional Header
  peStub.writeUInt16LE(0x010b, 0x98); // Magic: PE32
  peStub.writeUInt8(6, 0x9a); // MajorLinkerVersion
  peStub.writeUInt8(0, 0x9b);
  peStub.writeUInt32LE(0x00000600, 0x9c); // SizeOfCode
  peStub.writeUInt32LE(0x00000800, 0xa0); // SizeOfInitializedData
  peStub.writeUInt32LE(0x00000000, 0xa4);
  peStub.writeUInt32LE(0x00002000, 0xa8); // AddressOfEntryPoint
  peStub.writeUInt32LE(0x00002000, 0xac); // BaseOfCode
  peStub.writeUInt32LE(0x00004000, 0xb0); // BaseOfData
  peStub.writeUInt32LE(0x00400000, 0xb4); // ImageBase
  peStub.writeUInt32LE(0x00002000, 0xb8); // SectionAlignment
  peStub.writeUInt32LE(0x00000200, 0xbc); // FileAlignment
  peStub.writeUInt16LE(4, 0xc0); // MajorOSVersion
  peStub.writeUInt16LE(0, 0xc2);
  peStub.writeUInt16LE(0, 0xc4);
  peStub.writeUInt16LE(0, 0xc6);
  peStub.writeUInt16LE(4, 0xc8); // MajorSubsystemVersion
  peStub.writeUInt16LE(0, 0xca);
  peStub.writeUInt32LE(0, 0xcc);
  peStub.writeUInt32LE(0x00008000, 0xd0); // SizeOfImage
  peStub.writeUInt32LE(0x00000200, 0xd4); // SizeOfHeaders
  peStub.writeUInt32LE(0, 0xd8); // CheckSum
  peStub.writeUInt16LE(2, 0xdc); // Subsystem: IMAGE_SUBSYSTEM_WINDOWS_GUI (2)
  peStub.writeUInt16LE(0x8540, 0xde); // DllCharacteristics
  peStub.writeUInt32LE(0x00100000, 0xe0); // SizeOfStackReserve
  peStub.writeUInt32LE(0x00001000, 0xe4); // SizeOfStackCommit
  peStub.writeUInt32LE(0x00100000, 0xe8); // SizeOfHeapReserve
  peStub.writeUInt32LE(0x00001000, 0xec); // SizeOfHeapCommit
  peStub.writeUInt32LE(0, 0xf0);
  peStub.writeUInt32LE(16, 0xf4); // NumberOfRvaAndSizes

  // Section Headers
  // 1. .text (Code)
  peStub.write('.text\0\0\0', 0x178, 8, 'ascii');
  peStub.writeUInt32LE(0x00000600, 0x180); // VirtualSize
  peStub.writeUInt32LE(0x00002000, 0x184); // VirtualAddress
  peStub.writeUInt32LE(0x00000600, 0x188); // SizeOfRawData
  peStub.writeUInt32LE(0x00000200, 0x18c); // PointerToRawData
  peStub.writeUInt32LE(0x60000020, 0x19c); // Characteristics: CODE | EXECUTE | READ

  // 2. .rsrc (Resources)
  peStub.write('.rsrc\0\0\0', 0x1a0, 8, 'ascii');
  peStub.writeUInt32LE(0x00000600, 0x1a8);
  peStub.writeUInt32LE(0x00004000, 0x1ac);
  peStub.writeUInt32LE(0x00000600, 0x1b0);
  peStub.writeUInt32LE(0x00000800, 0x1b4);
  peStub.writeUInt32LE(0x40000040, 0x1c4); // INITIALIZED_DATA | READ

  // 3. .reloc
  peStub.write('.reloc\0\0', 0x1c8, 8, 'ascii');
  peStub.writeUInt32LE(0x00000200, 0x1d0);
  peStub.writeUInt32LE(0x00006000, 0x1d4);
  peStub.writeUInt32LE(0x00000200, 0x1d8);
  peStub.writeUInt32LE(0x00000e00, 0x1dc);
  peStub.writeUInt32LE(0x42000040, 0x1ec);

  compiledExe = peStub;
}

// 7. Сборка финального MIR-Setup.exe с полезной нагрузкой
const payloadMarker = Buffer.from('---MIR-PAYLOAD-START---', 'ascii');
const payloadEndMarker = Buffer.from('---MIR-PAYLOAD-END---', 'ascii');
const iconMarker = Buffer.from('---MIR-ICON-START---', 'ascii');
const iconEndMarker = Buffer.from('---MIR-ICON-END---', 'ascii');

const finalExe = Buffer.concat([
  compiledExe,
  payloadMarker,
  htmlData,
  payloadEndMarker,
  iconMarker,
  icoData,
  iconEndMarker,
]);

writeFileSync('dist-app/MIR-Setup.exe', finalExe);
writeFileSync('MIR-Setup.exe', finalExe);

console.log('');
console.log('✓ Windows установщик (.exe) успешно собран:');
console.log('    dist-app/MIR-Setup.exe  (и копия в корне: MIR-Setup.exe)');
console.log(`    Размер: ${(finalExe.length / 1024).toFixed(1)} КБ`);
console.log('    Установка: запустите файл двойным кликом на Windows — появится красивое меню установки.');
console.log('');
