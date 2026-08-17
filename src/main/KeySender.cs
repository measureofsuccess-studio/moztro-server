using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace MoztroKeyboard
{
    class Program
    {
        // ─── Win32 Structs ────────────────────────────────────────────────────────
        [StructLayout(LayoutKind.Sequential)]
        struct INPUT
        {
            public uint type;
            public InputUnion u;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct InputUnion
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
            [FieldOffset(0)] public HARDWAREINPUT hi;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct HARDWAREINPUT
        {
            public uint uMsg;
            public ushort wParamL;
            public ushort wParamH;
        }

        // ─── Win32 API Imports ────────────────────────────────────────────────────
        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        // ─── Constants ────────────────────────────────────────────────────────────
        const uint INPUT_MOUSE = 0;
        const uint INPUT_KEYBOARD = 1;
        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;

        const uint MOUSEEVENTF_MOVE = 0x0001;
        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;
        const uint MOUSEEVENTF_HWHEEL = 0x1000;

        // Virtual Keys
        const ushort VK_LWIN = 0x5B;
        const ushort VK_RWIN = 0x5C;
        const ushort VK_CONTROL = 0x11;
        const ushort VK_LCONTROL = 0xA2;
        const ushort VK_RCONTROL = 0xA3;
        const ushort VK_SHIFT = 0x10;
        const ushort VK_LSHIFT = 0xA0;
        const ushort VK_RSHIFT = 0xA1;
        const ushort VK_MENU = 0x12; // Alt
        const ushort VK_LMENU = 0xA4;
        const ushort VK_RMENU = 0xA5;
        const ushort VK_SPACE = 0x20;
        const ushort VK_RETURN = 0x0D;
        const ushort VK_BACK = 0x08;
        const ushort VK_TAB = 0x09;
        const ushort VK_ESCAPE = 0x1B;
        const ushort VK_DELETE = 0x2E;
        const ushort VK_INSERT = 0x2D;
        const ushort VK_HOME = 0x24;
        const ushort VK_END = 0x23;
        const ushort VK_PRIOR = 0x21; // Page Up
        const ushort VK_NEXT = 0x22;  // Page Down
        const ushort VK_LEFT = 0x25;
        const ushort VK_UP = 0x26;
        const ushort VK_RIGHT = 0x27;
        const ushort VK_DOWN = 0x28;
        const ushort VK_SNAPSHOT = 0x2C; // Print Screen
        const ushort VK_SCROLL = 0x91;   // Scroll Lock
        const ushort VK_PAUSE = 0x13;
        const ushort VK_CAPITAL = 0x14;  // Caps Lock
        const ushort VK_APPS = 0x5D;     // Menu / App key

        // Media Keys
        const ushort VK_VOLUME_MUTE = 0xAD;
        const ushort VK_VOLUME_DOWN = 0xAE;
        const ushort VK_VOLUME_UP = 0xAF;
        const ushort VK_MEDIA_NEXT_TRACK = 0xB0;
        const ushort VK_MEDIA_PREV_TRACK = 0xB1;
        const ushort VK_MEDIA_STOP = 0xB2;
        const ushort VK_MEDIA_PLAY_PAUSE = 0xB3;
        const ushort VK_LAUNCH_MAIL = 0xB4;
        const ushort VK_LAUNCH_APP2 = 0xB7; // Calculator

        // ─── Extended Key Detection ────────────────────────────────────────────────
        static bool IsExtendedKey(ushort vk)
        {
            return (vk >= 0x21 && vk <= 0x28) || // Navigation
                   vk == VK_INSERT || vk == VK_DELETE ||
                   vk == VK_LWIN || vk == VK_RWIN || vk == VK_APPS ||
                   (vk >= 0xAD && vk <= 0xB3);   // Volume & Media keys
        }

        // ─── Core SendInput helpers ────────────────────────────────────────────────
        static void SendInputs(List<INPUT> inputs)
        {
            if (inputs == null || inputs.Count == 0) return;
            INPUT[] arr = inputs.ToArray();
            uint sent = SendInput((uint)arr.Length, arr, Marshal.SizeOf(typeof(INPUT)));
            if (sent != arr.Length)
            {
                Console.Error.WriteLine(string.Format("SendInput partial: sent {0}/{1}, err={2}", sent, arr.Length, Marshal.GetLastWin32Error()));
            }
        }

        static INPUT MakeKeyInput(ushort vk, bool keyUp, ushort scan = 0)
        {
            INPUT inp = new INPUT();
            inp.type = INPUT_KEYBOARD;
            inp.u.ki.wVk = vk;
            inp.u.ki.wScan = scan != 0 ? scan : (ushort)MapVirtualKey(vk, 0);
            inp.u.ki.dwFlags = keyUp ? KEYEVENTF_KEYUP : 0u;
            if (IsExtendedKey(vk)) inp.u.ki.dwFlags |= KEYEVENTF_EXTENDEDKEY;
            return inp;
        }

        static INPUT MakeUnicodeInput(char c, bool keyUp)
        {
            INPUT inp = new INPUT();
            inp.type = INPUT_KEYBOARD;
            inp.u.ki.wVk = 0;
            inp.u.ki.wScan = (ushort)c;
            inp.u.ki.dwFlags = KEYEVENTF_UNICODE | (keyUp ? KEYEVENTF_KEYUP : 0u);
            return inp;
        }

        static void TapVk(ushort vk)
        {
            var list = new List<INPUT> { MakeKeyInput(vk, false), MakeKeyInput(vk, true) };
            SendInputs(list);
        }

        static void TypeUnicode(char c)
        {
            var list = new List<INPUT> { MakeUnicodeInput(c, false), MakeUnicodeInput(c, true) };
            SendInputs(list);
        }

        static void TapWinKey()
        {
            var list = new List<INPUT>
            {
                MakeKeyInput(VK_LWIN, false),
                MakeKeyInput(VK_LWIN, true)
            };
            SendInputs(list);
        }

        // ─── Key Name Resolution ──────────────────────────────────────────────────
        static ushort ResolveVk(string name)
        {
            if (string.IsNullOrEmpty(name)) return 0;
            switch (name.Trim().ToUpperInvariant())
            {
                case "SPACE": return VK_SPACE;
                case "ENTER": case "RETURN": return VK_RETURN;
                case "BACKSPACE": case "BKSP": return VK_BACK;
                case "TAB": return VK_TAB;
                case "ESC": case "ESCAPE": return VK_ESCAPE;
                case "DEL": case "DELETE": return VK_DELETE;
                case "INS": case "INSERT": return VK_INSERT;
                case "HOME": return VK_HOME;
                case "END": return VK_END;
                case "PGUP": case "PAGE_UP": return VK_PRIOR;
                case "PGDN": case "PAGE_DOWN": return VK_NEXT;
                case "UP": return VK_UP;
                case "DOWN": return VK_DOWN;
                case "LEFT": return VK_LEFT;
                case "RIGHT": return VK_RIGHT;
                case "PRTSC": case "PRINTSCREEN": return VK_SNAPSHOT;
                case "SCRLK": case "SCROLLLOCK": return VK_SCROLL;
                case "PAUSE": return VK_PAUSE;
                case "APP": case "MENU": return VK_APPS;
                case "CAPS": case "CAPSLOCK": return VK_CAPITAL;
                case "WIN": case "LWIN": return VK_LWIN;
                case "RWIN": return VK_RWIN;
                case "CTRL": case "CONTROL": return VK_LCONTROL;
                case "ALT": return VK_LMENU;
                case "SHIFT": return VK_LSHIFT;
                case "F1": return 0x70;
                case "F2": return 0x71;
                case "F3": return 0x72;
                case "F4": return 0x73;
                case "F5": return 0x74;
                case "F6": return 0x75;
                case "F7": return 0x76;
                case "F8": return 0x77;
                case "F9": return 0x78;
                case "F10": return 0x79;
                case "F11": return 0x7A;
                case "F12": return 0x7B;
                case "VOL+": case "VOL_UP": case "VOLUME_UP": return VK_VOLUME_UP;
                case "VOL-": case "VOL_DOWN": case "VOLUME_DOWN": return VK_VOLUME_DOWN;
                case "MUTE": case "VOLUME_MUTE": return VK_VOLUME_MUTE;
                case "PLAY": case "PLAY_PAUSE": return VK_MEDIA_PLAY_PAUSE;
                case "NEXT": case "MEDIA_NEXT": return VK_MEDIA_NEXT_TRACK;
                case "PREV": case "MEDIA_PREV": return VK_MEDIA_PREV_TRACK;
                case "CALC": return VK_LAUNCH_APP2;
                case "MAIL": return VK_LAUNCH_MAIL;
                default: return 0;
            }
        }

        static ushort ResolveModVk(string mod)
        {
            switch (mod.Trim().ToUpperInvariant())
            {
                case "WIN": case "LWIN": return VK_LWIN;
                case "CTRL": case "CONTROL": return VK_LCONTROL;
                case "ALT": return VK_LMENU;
                case "SHIFT": return VK_LSHIFT;
                default: return 0;
            }
        }

        // ─── Execute a RAW single key (no modifiers) ──────────────────────────────
        static void ExecuteRaw(string key)
        {
            string upper = key.Trim().ToUpperInvariant();

            if (upper == "WIN" || upper == "LWIN")
            {
                TapWinKey();
                return;
            }

            ushort vk = ResolveVk(key);
            if (vk != 0)
            {
                TapVk(vk);
            }
            else if (key.Length >= 1)
            {
                foreach (char c in key)
                {
                    TypeUnicode(c);
                }
            }
        }

        // ─── Execute a COMBO (modifiers + target key) ─────────────────────────────
        static void ExecuteCombo(string[] modifiers, string targetKey)
        {
            var downInputs = new List<INPUT>();
            var upInputs = new List<INPUT>();
            var activeMods = new List<ushort>();

            // Special-case: ALT+TAB -> Send Ctrl+Alt+Tab (Windows sticky Task Switcher) so overlay stays open on screen
            bool isAltOnly = modifiers != null && modifiers.Length == 1 &&
                             modifiers[0].Trim().ToUpperInvariant() == "ALT";
            if (isAltOnly && targetKey.Trim().ToUpperInvariant() == "TAB")
            {
                var stickyDown = new List<INPUT>
                {
                    MakeKeyInput(VK_LCONTROL, false),
                    MakeKeyInput(VK_LMENU, false)
                };
                SendInputs(stickyDown);
                Thread.Sleep(25);
                TapVk(VK_TAB);
                Thread.Sleep(25);
                var stickyUp = new List<INPUT>
                {
                    MakeKeyInput(VK_LMENU, true),
                    MakeKeyInput(VK_LCONTROL, true)
                };
                SendInputs(stickyUp);
                return;
            }

            // 1. Build modifier-down list
            if (modifiers != null)
            {
                foreach (var mod in modifiers)
                {
                    ushort modVk = ResolveModVk(mod);
                    if (modVk != 0 && !activeMods.Contains(modVk))
                    {
                        activeMods.Add(modVk);
                        downInputs.Add(MakeKeyInput(modVk, false));
                    }
                }
            }

            // 2. Press modifiers down first
            if (downInputs.Count > 0)
            {
                SendInputs(downInputs);
                Thread.Sleep(20);
            }

            // 3. Tap target key
            if (!string.IsNullOrEmpty(targetKey))
            {
                string upper = targetKey.Trim().ToUpperInvariant();

                if (activeMods.Count == 0 && (upper == "WIN" || upper == "LWIN"))
                {
                    TapWinKey();
                }
                else
                {
                    ushort specialVk = ResolveVk(targetKey);
                    if (specialVk != 0)
                    {
                        TapVk(specialVk);
                    }
                    else if (targetKey.Length == 1)
                    {
                        char c = targetKey[0];
                        char cu = char.ToUpperInvariant(c);
                        if (activeMods.Count > 0 && ((cu >= 'A' && cu <= 'Z') || (cu >= '0' && cu <= '9')))
                        {
                            TapVk((ushort)cu);
                        }
                        else
                        {
                            TypeUnicode(c);
                        }
                    }
                }
            }

            Thread.Sleep(20);

            // 4. Release modifiers (reverse order)
            for (int i = activeMods.Count - 1; i >= 0; i--)
                upInputs.Add(MakeKeyInput(activeMods[i], true));

            if (upInputs.Count > 0)
                SendInputs(upInputs);
        }

        static void KeyDown(string mod)
        {
            ushort vk = ResolveModVk(mod);
            if (vk == 0) vk = ResolveVk(mod);
            if (vk != 0)
            {
                SendInputs(new List<INPUT> { MakeKeyInput(vk, false) });
            }
        }

        static void KeyUp(string mod)
        {
            ushort vk = ResolveModVk(mod);
            if (vk == 0) vk = ResolveVk(mod);
            if (vk != 0)
            {
                SendInputs(new List<INPUT> { MakeKeyInput(vk, true) });
            }
        }

        static void ReleaseAllModifiers()
        {
            var list = new List<INPUT>
            {
                MakeKeyInput(VK_LCONTROL, true),
                MakeKeyInput(VK_RCONTROL, true),
                MakeKeyInput(VK_LMENU, true),
                MakeKeyInput(VK_RMENU, true),
                MakeKeyInput(VK_LSHIFT, true),
                MakeKeyInput(VK_RSHIFT, true),
                MakeKeyInput(VK_LWIN, true),
                MakeKeyInput(VK_RWIN, true)
            };
            SendInputs(list);
        }

        // ─── Mouse Actions ────────────────────────────────────────────────────────
        static float accumX = 0f;
        static float accumY = 0f;

        static void MouseMove(float fx, float fy)
        {
            accumX += fx;
            accumY += fy;
            int dx = (int)accumX;
            int dy = (int)accumY;
            accumX -= dx;
            accumY -= dy;

            if (dx == 0 && dy == 0) return;

            POINT pt;
            if (GetCursorPos(out pt))
            {
                SetCursorPos(pt.X + dx, pt.Y + dy);
            }
            else
            {
                mouse_event(MOUSEEVENTF_MOVE, dx, dy, 0, UIntPtr.Zero);
            }
        }

        static void MouseMoveAbs(int x, int y)
        {
            SetCursorPos(x, y);
        }

        static void MouseClick(string button)
        {
            string b = (button ?? "LEFT").Trim().ToUpperInvariant();
            if (b == "RIGHT" || b == "R")
            {
                mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(10);
                mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            }
            else if (b == "MIDDLE" || b == "M")
            {
                mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(10);
                mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
            }
            else
            {
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
                Thread.Sleep(10);
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            }
        }

        static void MouseDown(string button)
        {
            string b = (button ?? "LEFT").Trim().ToUpperInvariant();
            if (b == "RIGHT" || b == "R")
                mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
            else if (b == "MIDDLE" || b == "M")
                mouse_event(MOUSEEVENTF_MIDDLEDOWN, 0, 0, 0, UIntPtr.Zero);
            else
                mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        }

        static void MouseUp(string button)
        {
            string b = (button ?? "LEFT").Trim().ToUpperInvariant();
            if (b == "RIGHT" || b == "R")
                mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            else if (b == "MIDDLE" || b == "M")
                mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, UIntPtr.Zero);
            else
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        }

        static void MouseScroll(int delta)
        {
            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)delta, UIntPtr.Zero);
        }

        // ─── Main Loop ────────────────────────────────────────────────────────────
        static void Main(string[] args)
        {
            Console.OutputEncoding = System.Text.Encoding.UTF8;
            var stdout = new System.IO.StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
            Console.SetOut(stdout);
            Console.WriteLine("READY");

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (line == "EXIT" || line == "QUIT") break;
                if (string.IsNullOrEmpty(line)) continue;

                try
                {
                    bool isStream = false;
                    if (line.StartsWith("M_ABS:", StringComparison.OrdinalIgnoreCase) || line.StartsWith("MOUSE_MOVE_ABS:", StringComparison.OrdinalIgnoreCase))
                    {
                        isStream = true;
                        string coords = line.StartsWith("M_ABS:", StringComparison.OrdinalIgnoreCase) ? line.Substring(6) : line.Substring(15);
                        int comma = coords.IndexOf(',');
                        if (comma > 0)
                        {
                            int x = int.Parse(coords.Substring(0, comma), System.Globalization.CultureInfo.InvariantCulture);
                            int y = int.Parse(coords.Substring(comma + 1), System.Globalization.CultureInfo.InvariantCulture);
                            MouseMoveAbs(x, y);
                        }
                    }
                    else if (line.StartsWith("M:", StringComparison.OrdinalIgnoreCase) || line.StartsWith("MOUSE_MOVE:", StringComparison.OrdinalIgnoreCase))
                    {
                        isStream = true;
                        string coords = line.StartsWith("M:", StringComparison.OrdinalIgnoreCase) ? line.Substring(2) : line.Substring(11);
                        int comma = coords.IndexOf(',');
                        if (comma > 0)
                        {
                            float fx = float.Parse(coords.Substring(0, comma), System.Globalization.CultureInfo.InvariantCulture);
                            float fy = float.Parse(coords.Substring(comma + 1), System.Globalization.CultureInfo.InvariantCulture);
                            MouseMove(fx, fy);
                        }
                    }
                    else if (line.StartsWith("MOUSE_CLICK:", StringComparison.OrdinalIgnoreCase))
                    {
                        string btn = line.Substring(12);
                        MouseClick(btn);
                    }
                    else if (line.StartsWith("MOUSE_DOWN:", StringComparison.OrdinalIgnoreCase))
                    {
                        string btn = line.Substring(11);
                        MouseDown(btn);
                    }
                    else if (line.StartsWith("MOUSE_UP:", StringComparison.OrdinalIgnoreCase))
                    {
                        string btn = line.Substring(9);
                        MouseUp(btn);
                    }
                    else if (line.StartsWith("MOUSE_SCROLL:", StringComparison.OrdinalIgnoreCase))
                    {
                        string deltaStr = line.Substring(13);
                        int delta = int.Parse(deltaStr, System.Globalization.CultureInfo.InvariantCulture);
                        MouseScroll(delta);
                    }
                    else if (line.StartsWith("KEY_DOWN:", StringComparison.OrdinalIgnoreCase))
                    {
                        string mod = line.Substring(9);
                        KeyDown(mod);
                    }
                    else if (line.StartsWith("KEY_UP:", StringComparison.OrdinalIgnoreCase))
                    {
                        string mod = line.Substring(7);
                        KeyUp(mod);
                    }
                    else if (line.Equals("RELEASE_ALL", StringComparison.OrdinalIgnoreCase))
                    {
                        ReleaseAllModifiers();
                    }
                    else if (line.StartsWith("COMBO:", StringComparison.OrdinalIgnoreCase))
                    {
                        string body = line.Substring(6);
                        int plusIdx = body.LastIndexOf('+');
                        if (plusIdx >= 0)
                        {
                            string modsPart = body.Substring(0, plusIdx);
                            string keyPart = body.Substring(plusIdx + 1);
                            string[] mods = string.IsNullOrEmpty(modsPart)
                                ? new string[0]
                                : modsPart.Split(new char[] { ',' }, StringSplitOptions.RemoveEmptyEntries);
                            ExecuteCombo(mods, keyPart);
                        }
                        else
                        {
                            ExecuteRaw(body);
                        }
                    }
                    else if (line.StartsWith("RAW:", StringComparison.OrdinalIgnoreCase))
                    {
                        ExecuteRaw(line.Substring(4));
                    }
                    else
                    {
                        ExecuteRaw(line);
                    }

                    if (!isStream)
                    {
                        Console.WriteLine("OK");
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("ERR: " + ex.Message);
                }
            }
        }
    }
}
