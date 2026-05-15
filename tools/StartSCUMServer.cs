using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Text;

class StartSCUMServer
{
    static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("Usage: StartSCUMServer.exe <windowTitle> <exePath> [args...]");
            return 1;
        }

        string windowTitle = args[0];
        string exePath = args[1];
        string workDir = Path.GetDirectoryName(exePath);

        // Build arguments string (skip first two = windowTitle + exePath)
        StringBuilder argBuilder = new StringBuilder();
        for (int i = 2; i < args.Length; i++)
        {
            if (argBuilder.Length > 0) argBuilder.Append(' ');
            argBuilder.Append(args[i]);
        }
        string arguments = argBuilder.ToString();

        ProcessStartInfo psi = new ProcessStartInfo(exePath);
        psi.UseShellExecute = true;       // ShellExecuteEx — handles elevation via shell
        psi.Arguments = arguments;
        psi.WorkingDirectory = workDir;
        psi.Verb = "open";
        psi.WindowStyle = ProcessWindowStyle.Normal;

        try
        {
            using (Process proc = Process.Start(psi))
            {
                Console.WriteLine(proc.Id);
                return 0;
            }
        }
        catch (Win32Exception ex)
        {
            Console.Error.WriteLine("Start failed: {0} (0x{0:X})", ex.NativeErrorCode);
            Console.Error.WriteLine(ex.Message);
            return 2;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("Start failed: {0}", ex.Message);
            return 3;
        }
    }
}
