using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;

class CloseSCUMWindow
{
    const uint WM_CLOSE = 0x0010;
    const uint WM_QUIT = 0x0012;

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string lpszClass, string lpszWindow);

    [DllImport("user32.dll", SetLastError = true)]
    static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern IntPtr GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    static bool IsConsoleWindow(IntPtr hWnd)
    {
        StringBuilder sb = new StringBuilder(256);
        GetClassName(hWnd, sb, sb.Capacity);
        return sb.ToString() == "ConsoleWindowClass";
    }

    static int Main(string[] args)
    {
        if (args.Length < 1)
        {
            Console.Error.WriteLine("Usage: CloseSCUMWindow.exe <windowTitleContains>");
            return 1;
        }

        string searchText = args[0].ToLowerInvariant();
        bool found = false;

        EnumWindows((hWnd, lParam) =>
        {
            int len = (int)GetWindowTextLength(hWnd);
            if (len > 0 && IsConsoleWindow(hWnd))
            {
                StringBuilder sb = new StringBuilder(len + 1);
                GetWindowText(hWnd, sb, sb.Capacity);
                string title = sb.ToString();
                if (title.ToLowerInvariant().Contains(searchText))
                {
                    SendMessage(hWnd, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
                    Console.Error.WriteLine("Sent WM_CLOSE to console: {0}", title);
                    found = true;
                }
            }
            return true;
        }, IntPtr.Zero);

        if (!found)
        {
            Console.Error.WriteLine("No console window containing '{0}' found", args[0]);
            return 2;
        }

        return 0;
    }
}
