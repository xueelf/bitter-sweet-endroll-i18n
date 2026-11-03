using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace BseSetup;

internal static class Program
{
    private static readonly string SetupVersion =
        typeof(Program).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()!
            .InformationalVersion.Split('+')[0];
    private const string GameProcess = "BitterSweetEndroll";

    private static readonly Dictionary<string, string> Text = new();
    private static bool _force;
    private static bool _dryRun;
    private static bool _noPause;

    private static string T(string key) =>
        Text.TryGetValue(key, out string? value) ? value : key;

    private static string TF(string key, params object[] args) =>
        string.Format(T(key), args);

    private static void LoadLocale()
    {
        string ui = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName;
        Assembly asm = Assembly.GetExecutingAssembly();
        string[] names = asm.GetManifestResourceNames();
        string? resource = names.FirstOrDefault(n =>
                n.EndsWith($"locales.{ui}.json", StringComparison.OrdinalIgnoreCase))
            ?? names.FirstOrDefault(n =>
                n.EndsWith("locales.ja.json", StringComparison.OrdinalIgnoreCase));
        if (resource == null)
        {
            return;
        }

        using Stream? stream = asm.GetManifestResourceStream(resource);
        if (stream == null)
        {
            return;
        }

        using var document = JsonDocument.Parse(stream);
        foreach (JsonProperty property in document.RootElement.EnumerateObject())
        {
            Text[property.Name] = property.Value.GetString() ?? "";
        }
    }

    private static int Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        LoadLocale();
        try
        {
            Options options = ParseArgs(args);
            _force = options.Force;
            _dryRun = options.DryRun;
            _noPause = options.NoPause;

            if (options.Help)
            {
                PrintHelp();
                return 0;
            }

            if (args.Length == 0)
            {
                return RunMenu();
            }

            Console.WriteLine(TF("menu.header", SetupVersion));
            if (!TryResolve(out string resDir))
            {
                return 1;
            }
            Console.WriteLine(TF("menu.game_dir", GameRoot(resDir)));
            Console.WriteLine();
            if (!CheckGameDir(resDir))
            {
                return 1;
            }
            if (IsGameRunning() && !_force)
            {
                Error(T("game.running"));
                Error(T("game.running_force"));
                return 1;
            }

            return options.Uninstall ? Uninstall(resDir) : Install(resDir);
        }
        catch (Exception ex)
        {
            Error(TF("error.prefix", ex.Message));
            return 1;
        }
        finally
        {
            if (!_noPause && !Console.IsInputRedirected)
            {
                Console.WriteLine();
                Console.WriteLine(T("cli.pause"));
                try { Console.ReadKey(true); } catch { }
            }
        }
    }

    private static int RunMenu()
    {
        while (true)
        {
            Console.WriteLine(TF("menu.header", SetupVersion));
            Console.WriteLine();

            if (!TryResolve(out string resDir))
            {
                return 1;
            }

            Console.WriteLine(TF("menu.game_dir", GameRoot(resDir)));
            Console.WriteLine(TF("menu.state", GetState(resDir)));
            Console.WriteLine();
            Console.WriteLine(T("menu.install"));
            Console.WriteLine(T("menu.uninstall"));
            Console.WriteLine(T("menu.exit"));
            Console.WriteLine();
            Console.Write(T("menu.prompt"));

            string? choice = ReadChoice();
            Console.WriteLine();
            if (choice == null)
            {
                return 0;
            }

            string c = choice.Trim().ToLowerInvariant();
            if (c == "3")
            {
                return 0;
            }
            if (c != "1" && c != "2")
            {
                Console.WriteLine(T("menu.invalid"));
                continue;
            }

            if (IsGameRunning() && !_force)
            {
                Error(T("game.running"));
                PauseMenu();
                continue;
            }

            try
            {
                if (c == "1")
                {
                    if (!CheckGameDir(resDir))
                    {
                        PauseMenu();
                        continue;
                    }
                    Install(resDir);
                }
                else
                {
                    Uninstall(resDir);
                }
            }
            catch (Exception ex)
            {
                Error(TF("error.prefix", ex.Message));
            }

            PauseMenu();
        }
    }

    private static bool TryResolve(out string resDir)
    {
        string baseDir = AppContext.BaseDirectory;
        string[] candidates =
        {
            Path.Combine(baseDir, "Data", "resources"),
            Path.Combine(baseDir, "resources"),
            baseDir,
        };

        foreach (string candidate in candidates)
        {
            if (File.Exists(Path.Combine(candidate, "app.asar")) ||
                File.Exists(Path.Combine(candidate, "base.asar")))
            {
                resDir = Path.TrimEndingDirectorySeparator(candidate);
                return true;
            }
        }

        resDir = "";
        Error(T("game.place_in_game_dir"));
        return false;
    }

    private static string GameRoot(string resDir)
    {
        resDir = Path.TrimEndingDirectorySeparator(resDir);
        string parent = Path.GetDirectoryName(resDir) ?? resDir;
        return string.Equals(
            Path.GetFileName(resDir), "resources", StringComparison.OrdinalIgnoreCase)
            ? Path.GetDirectoryName(parent) ?? parent
            : parent;
    }

    private static bool CheckGameDir(string resDir)
    {
        string root = GameRoot(resDir);
        string exe = Path.Combine(root, "Data", "BitterSweetEndroll.exe");
        if (!File.Exists(exe))
        {
            if (_force)
            {
                return true;
            }
            Error(T("game.not_game_dir"));
            Error(T("game.not_game_dir_force"));
            return false;
        }

        string? found = GetGameVersion(exe);
        if (found != null && found != SetupVersion)
        {
            Warn(TF("game.version_mismatch", found, SetupVersion));
        }
        return true;
    }

    private static string? GetGameVersion(string exe)
    {
        try
        {
            string? version = FileVersionInfo.GetVersionInfo(exe).FileVersion;
            if (string.IsNullOrWhiteSpace(version))
            {
                return null;
            }

            var parts = new List<string>();
            foreach (string part in version.Split('.'))
            {
                if (!int.TryParse(part, out int number))
                {
                    break;
                }
                parts.Add(number.ToString());
                if (parts.Count == 3)
                {
                    break;
                }
            }
            return parts.Count == 3 ? string.Join('.', parts) : null;
        }
        catch
        {
            return null;
        }
    }

    private static string GetState(string resDir)
    {
        string app = Path.Combine(resDir, "app.asar");
        string bak = Path.Combine(resDir, "base.asar");
        if (File.Exists(bak))
        {
            return T("state.installed");
        }
        return File.Exists(app) ? T("state.not_installed") : T("state.missing");
    }

    private static byte[] ReadPayload()
    {
        Assembly asm = Assembly.GetExecutingAssembly();
        string[] names = asm.GetManifestResourceNames();
        string? brName = names.FirstOrDefault(n =>
            n.EndsWith("app.asar.br", StringComparison.OrdinalIgnoreCase));
        string? shaName = names.FirstOrDefault(n =>
            n.EndsWith("app.asar.sha256", StringComparison.OrdinalIgnoreCase));
        if (brName == null || shaName == null)
        {
            throw new InvalidOperationException(T("error.payload_missing"));
        }

        byte[] compressed;
        using (Stream stream = asm.GetManifestResourceStream(brName)!)
        using (var memory = new MemoryStream())
        {
            stream.CopyTo(memory);
            compressed = memory.ToArray();
        }

        string expected;
        using (Stream stream = asm.GetManifestResourceStream(shaName)!)
        using (var reader = new StreamReader(stream, Encoding.UTF8))
        {
            expected = reader.ReadToEnd().Trim().ToLowerInvariant();
        }

        byte[] payload;
        using (var input = new MemoryStream(compressed))
        using (var brotli = new BrotliStream(input, CompressionMode.Decompress))
        using (var output = new MemoryStream())
        {
            brotli.CopyTo(output);
            payload = output.ToArray();
        }

        string actual = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
        if (actual != expected)
        {
            throw new InvalidDataException(T("error.payload_hash"));
        }

        return payload;
    }

    private static int Install(string resDir)
    {
        string app = Path.Combine(resDir, "app.asar");
        string bak = Path.Combine(resDir, "base.asar");

        Info(T("install.reading"));
        byte[] payload = ReadPayload();
        string hash = Convert.ToHexString(SHA256.HashData(payload)).ToLowerInvariant();
        Info(TF(
            "install.payload_ok",
            $"{payload.Length / 1048576.0:F1} MB, SHA-256 {hash[..12]}…"));

        if (!File.Exists(app) && !File.Exists(bak))
        {
            Error(T("error.no_original"));
            return 1;
        }

        if (_dryRun)
        {
            Success(T("dry_run.done"));
            return 0;
        }

        bool updating = File.Exists(bak);
        if (!updating)
        {
            Info(T("install.backup"));
            File.Move(app, bak);
        }

        string temp = app + ".bse.tmp";
        try
        {
            Info(T("install.writing"));
            File.WriteAllBytes(temp, payload);

            Info(T("install.verify"));
            string written = Convert.ToHexString(
                SHA256.HashData(File.ReadAllBytes(temp))).ToLowerInvariant();
            if (written != hash)
            {
                throw new InvalidDataException("hash mismatch");
            }

            File.Move(temp, app, overwrite: true);
        }
        catch (Exception ex)
        {
            try { if (File.Exists(temp)) File.Delete(temp); } catch { }
            if (!updating && File.Exists(bak) && !File.Exists(app))
            {
                try { File.Move(bak, app); } catch { }
            }
            Error(TF("error.write", ex.Message));
            return 1;
        }

        Success(updating ? T("install.update_done") : T("install.done"));
        Console.WriteLine();
        Console.WriteLine(T("install.uninstall_hint"));
        return 0;
    }

    private static int Uninstall(string resDir)
    {
        string app = Path.Combine(resDir, "app.asar");
        string bak = Path.Combine(resDir, "base.asar");
        if (!File.Exists(bak))
        {
            Error(T("uninstall.not_installed"));
            return 1;
        }

        if (_dryRun)
        {
            Success(T("dry_run.done"));
            return 0;
        }

        File.Move(bak, app, overwrite: true);
        Success(T("uninstall.done"));
        return 0;
    }

    private static bool IsGameRunning()
    {
        Process[] processes = Process.GetProcessesByName(GameProcess);
        foreach (Process process in processes)
        {
            try { process.Dispose(); } catch { }
        }
        return processes.Length > 0;
    }

    private static string? ReadChoice()
    {
        if (Console.IsInputRedirected)
        {
            return Console.ReadLine()?.Trim();
        }

        try
        {
            char choice = Console.ReadKey(true).KeyChar;
            Console.WriteLine(choice);
            return choice.ToString();
        }
        catch
        {
            return Console.ReadLine()?.Trim();
        }
    }

    private static void PauseMenu()
    {
        if (Console.IsInputRedirected)
        {
            return;
        }

        Console.WriteLine();
        Console.WriteLine(T("menu.pause"));
        try { Console.ReadKey(true); } catch { }
    }

    private static Options ParseArgs(string[] args)
    {
        var options = new Options();
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i].ToLowerInvariant())
            {
                case "--uninstall":
                    options.Uninstall = true;
                    break;
                case "--dry-run":
                    options.DryRun = true;
                    break;
                case "--force":
                    options.Force = true;
                    break;
                case "--no-pause":
                    options.NoPause = true;
                    break;
                case "-h":
                case "--help":
                    options.Help = true;
                    break;
                default:
                    throw new ArgumentException(TF("error.unknown_arg", args[i]));
            }
        }
        return options;
    }

    private static void PrintHelp()
    {
        string exeName = Path.GetFileName(Environment.ProcessPath ?? "setup.exe");
        Console.WriteLine(TF("help.text", exeName, SetupVersion));
    }

    private static void Info(string message) => Console.WriteLine(message);

    private static void Success(string message)
    {
        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine(message);
        Console.ResetColor();
    }

    private static void Warn(string message)
    {
        Console.ForegroundColor = ConsoleColor.Yellow;
        Console.WriteLine(message);
        Console.ResetColor();
    }

    private static void Error(string message)
    {
        Console.ForegroundColor = ConsoleColor.Red;
        Console.Error.WriteLine(message);
        Console.ResetColor();
    }

    private sealed class Options
    {
        public bool Uninstall;
        public bool DryRun;
        public bool Force;
        public bool NoPause;
        public bool Help;
    }
}
