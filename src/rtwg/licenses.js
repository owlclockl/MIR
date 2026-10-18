// GPL-3.0-or-later. Notices are embedded in both web and offline builds.
import gpl from '../../vendor/rtwg/LICENSE?raw';
import plateLicense from '../../vendor/rtplatec/LICENSE?raw';
import noiseLicense from '../../vendor/libnoise/LICENSE.md?raw';
import libcxx from '../../vendor/rtwg-browser/LIBCXX-LICENSE.txt?raw';
import libcxxabi from '../../vendor/rtwg-browser/LIBCXXABI-LICENSE.txt?raw';
import wasi from '../../vendor/rtwg-browser/WASI-LIBC-LICENSE.txt?raw';
import apache from '../../vendor/rtwg-browser/WASI-LICENSE-APACHE.txt?raw';
import llvm from '../../vendor/rtwg-browser/WASI-LICENSE-APACHE-LLVM.txt?raw';
import mit from '../../vendor/rtwg-browser/WASI-LICENSE-MIT.txt?raw';
import musl from '../../vendor/rtwg-browser/WASI-THIRD-PARTY-0.txt?raw';
import cloudlibc from '../../vendor/rtwg-browser/WASI-THIRD-PARTY-1.txt?raw';
import fts from '../../vendor/rtwg-browser/WASI-THIRD-PARTY-2.txt?raw';
export const RTWG_NOTICES = `RTWG browser port for The civilization of the sages (2026-10-14), GPL-3.0-or-later.
Original RTWG by tarTG: https://github.com/tarTG/RTWG
Revision: 6cbf782c47c360dcf4bf5ca9b0d1b999d85dac38
RTplatec: https://github.com/tarTG/RTplatec
Revision: c75d9605858d1f65bf1cc283834149ab009b2880
Plate tectonics copyright (C) 2012–2013 Lauri Viitanen; 2014–2015 Federico Tomassetti, Bret Curtis.
RTplatec root GPLv3; individual inherited source headers LGPL-2.1-or-later remain in the source snapshot.
libnoise: https://github.com/qknight/libnoise
Revision: 9ce0737b55812f7de907e86dc633724524e3a8e8 (LGPL-2.1).
Complete corresponding source, build adapter and instructions accompany The civilization of the sages:
vendor/rtwg, vendor/rtplatec, vendor/libnoise, vendor/rtwg-browser,
src/rtwg and scripts/build-rtwg.mjs; see docs/rtwg-browser.md.
The browser adaptation changes API/graphics/error handling; it does not claim binary-identical GPU results.
No warranty. Modified combined distribution containing RTWG is subject to GPLv3;
third-party code retains its own notices. Original shaders and libraries are retained unmodified.

RTWG license:\n${gpl}\n\nRTplatec license:\n${plateLicense}\n\nlibnoise license:\n${noiseLicense}\n\nLinked runtime libraries:\n${libcxx}\n${libcxxabi}\n${wasi}\n${apache}\n${llvm}\n${mit}\n${musl}\n${cloudlibc}\n${fts}`;
