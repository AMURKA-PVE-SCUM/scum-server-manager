using System;
using System.Runtime.InteropServices;
using System.Threading;

class SendCtrlC
{
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AttachConsole(uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GenerateConsoleCtrlEvent(uint dwCtrlEvent, uint dwProcessGroupId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool SetConsoleCtrlHandler(IntPtr HandlerRoutine, bool Add);

    static int Main(string[] args)
    {
        uint pid;
        if (args.Length < 1 || !uint.TryParse(args[0], out pid))
        {
            Console.Error.WriteLine("Usage: SendCtrlC.exe <pid>");
            return 1;
        }

        try
        {
            // Step 1: Detach our own console
            FreeConsole();

            // Step 2: Ignore Ctrl+C ourselves so we don't get killed too
            SetConsoleCtrlHandler(IntPtr.Zero, true);

            // Step 3: Attach to the target process's console
            if (!AttachConsole(pid))
            {
                int ec = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("AttachConsole({0}) failed: {1}", pid, ec);
                SetConsoleCtrlHandler(IntPtr.Zero, false);
                return 2;
            }

            // Step 4: Allow time for everything to settle
            Thread.Sleep(200);

            // Step 5: Send Ctrl+C (CTRL_C_EVENT = 0, to whole group = 0)
            if (!GenerateConsoleCtrlEvent(0, 0))
            {
                int ec = Marshal.GetLastWin32Error();
                Console.Error.WriteLine("GenerateConsoleCtrlEvent failed: {0}", ec);
                FreeConsole();
                SetConsoleCtrlHandler(IntPtr.Zero, false);
                return 3;
            }

            // Step 6: Give the process time to handle the signal
            Thread.Sleep(1000);

            // Step 7: Detach and restore handler
            FreeConsole();
            SetConsoleCtrlHandler(IntPtr.Zero, false);

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("SendCtrlC error: {0}", ex.Message);
            try { FreeConsole(); } catch { }
            try { SetConsoleCtrlHandler(IntPtr.Zero, false); } catch { }
            return 4;
        }
    }
}
