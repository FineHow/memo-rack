using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Shapes;
using System.Windows.Threading;
using Forms = System.Windows.Forms;
using Drawing = System.Drawing;
using IOPath = System.IO.Path;
using ShapePath = System.Windows.Shapes.Path;

namespace Clothesline {
  public class Todo {
    public string id { get; set; } public string title { get; set; } public string note { get; set; }
    public string category { get; set; } public string color { get; set; } 
    public double dueAt { get; set; } public double createdAt { get; set; } public double? completedAt { get; set; }
    public bool demo { get; set; }
    public string companionId {get;set;} public double? cancelledAt {get;set;} public double snoozedUntil {get;set;}
    public double lastReminderAt {get;set;} public string lastReminderPhase {get;set;} public double nextReminderAt {get;set;} public double cooldownUntil {get;set;}
  }
  public class Settings {
    public int urgentMinutes { get; set; } public bool quiet { get; set; } public bool reducedMotion { get; set; }
    public double quietUntil {get;set;}
    public Settings() { urgentMinutes = 5; }
  }
  public class State {
    public int version { get; set; } public List<Todo> tasks { get; set; } public Settings settings { get; set; }
    public string currentTaskId {get;set;}
    public State() { version = 2; tasks = new List<Todo>(); settings = new Settings(); }
  }
  public static partial class Rules {
    public static double? TestTime;
    public static double Now() { if(TestTime.HasValue)return TestTime.Value;return (DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds; }
    public static DateTime Local(double ms) { return new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc).AddMilliseconds(ms).ToLocalTime(); }
    public static readonly string[] Colors = { "sage", "lavender", "peach", "blue", "butter", "ivory" };
    public static readonly string[] Categories = { "工作", "生活", "灵感", "健康" };
    public static void ValidateTask(Todo t) {
      if (t == null || String.IsNullOrWhiteSpace(t.title) || t.title.Length > 60 || t.note == null || t.note.Length > 500)
        throw new Exception("名称请填写 1–60 字，备注最多 500 字。");
      if (!Colors.Contains(t.color) || !Categories.Contains(t.category)) throw new Exception("请选择有效的纸色和分类。");
      if (Double.IsNaN(t.dueAt) || Double.IsInfinity(t.dueAt) || t.dueAt < 0 || t.dueAt > 253402214400000d) throw new Exception("请选择有效的截止时间。");
    }
    public static void Validate(State s) {
      if (s == null || (s.version != 1 && s.version != 2) || s.tasks == null || s.tasks.Count > 10000 || s.settings == null) throw new Exception("待办文件格式损坏，请先备份原文件。");
      s.version=2;
      var ids = new HashSet<string>();
      foreach (var t in s.tasks) {
        ValidateTask(t);
        foreach(var v in new[]{t.snoozedUntil,t.lastReminderAt,t.nextReminderAt,t.cooldownUntil,t.cancelledAt??0})if(Double.IsNaN(v)||Double.IsInfinity(v)||v<0)throw new Exception("提醒时间损坏");
        if (String.IsNullOrWhiteSpace(t.id) || !ids.Add(t.id) || Double.IsNaN(t.createdAt) || Double.IsInfinity(t.createdAt)
          || (t.completedAt.HasValue && (Double.IsNaN(t.completedAt.Value) || Double.IsInfinity(t.completedAt.Value)))) throw new Exception("待办记录损坏。");
      }
      if(Double.IsNaN(s.settings.quietUntil)||Double.IsInfinity(s.settings.quietUntil)||s.settings.quietUntil<0)throw new Exception("安静期限损坏");
      if (!(new[] { 1, 5, 15, 30, 60 }).Contains(s.settings.urgentMinutes)) throw new Exception("提醒时间不正确。");
    }
    public static int Level(Todo t, Settings s, double now) { return t.dueAt <= now ? 3 : t.dueAt - now <= s.urgentMinutes * 60000 ? 2 : t.dueAt - now <= 3600000 ? 1 : 0; }
    public static string Countdown(Todo t, double now) {
      var span = TimeSpan.FromMilliseconds(Math.Abs(t.dueAt - now));
      return (t.dueAt <= now ? "已超时 " : "") + (span.TotalHours >= 24 ? ((int)span.TotalDays) + "天 " + span.Hours + "小时" : String.Format("{0:00}:{1:00}:{2:00}", (int)span.TotalHours, span.Minutes, span.Seconds));
    }
    public static State Apply(State state, string json, double now) {
      var serializer = new JavaScriptSerializer();
      var command = serializer.Deserialize<Dictionary<string, object>>(json);
      if (command == null || !command.ContainsKey("type")) throw new Exception("操作无效。");
      var s = serializer.Deserialize<State>(serializer.Serialize(state));
      string type = Convert.ToString(command["type"]);
      string id = command.ContainsKey("id") ? Convert.ToString(command["id"]) : "";
      var task = s.tasks.FirstOrDefault(t => t.id == id);
      if (type == "add" || type == "update") {
        var input = serializer.Deserialize<Todo>(serializer.Serialize(command["input"])); ValidateTask(input);
        if (type == "add") {
          if (String.IsNullOrWhiteSpace(id) || task != null) throw new Exception("待办编号无效。");
          if (input.dueAt <= now) throw new Exception("新待办的截止时间需要晚于现在。");
          input.id = id; input.title = input.title.Trim(); input.createdAt = now; input.completedAt = null; input.demo = false; s.tasks.Add(input);
        } else {
          if (task == null || task.completedAt.HasValue || task.cancelledAt.HasValue) throw new Exception("只能修改还挂着的待办。");
          task.title = input.title.Trim(); task.note = input.note; task.category = input.category; task.color = input.color; task.dueAt = input.dueAt; task.companionId=input.companionId;
        }
      } else if (type == "complete" || type == "restore" || type == "cancel") {
        if (task == null) throw new Exception("找不到这张便签。");
        if(type=="restore"&&!task.completedAt.HasValue&&!task.cancelledAt.HasValue)return s;
        if(type=="complete"&&task.cancelledAt.HasValue)throw new Exception("请先恢复已取消任务");
        if(type=="complete")task.completedAt=task.completedAt??now;
        if(type=="cancel")task.cancelledAt=task.cancelledAt??now;
        if(type=="restore"){task.completedAt=null;task.cancelledAt=null;task.snoozedUntil=0;task.cooldownUntil=now+1000;if(command.ContainsKey("dueAt"))task.dueAt=Convert.ToDouble(command["dueAt"]);}
        if(s.currentTaskId==id)s.currentTaskId=null;
      } else if(type=="reminded" || type=="stop" || type=="snooze" || type=="start") {
        if(task==null || task.completedAt.HasValue || task.cancelledAt.HasValue)throw new Exception("这件事已收起");
        double interval=command.ContainsKey("interval")?Convert.ToDouble(command["interval"]):60;
        if(interval<10||interval>3600||Double.IsNaN(interval))throw new Exception("提醒间隔无效");
        if(type=="reminded"){task.lastReminderAt=now;task.lastReminderPhase=Convert.ToString(command["phase"]);task.nextReminderAt=now+interval*1000;}
        else if(type=="stop"){task.cooldownUntil=task.nextReminderAt=now+interval*1000;}
        else {task.snoozedUntil=task.cooldownUntil=now+600000;if(type=="start")s.currentTaskId=id;}
      } else if(type=="unassign") {
        foreach(var t in s.tasks)if(t.companionId==id)t.companionId=null;
      } else if (type == "settings") {
        s.settings = serializer.Deserialize<Settings>(serializer.Serialize(command["input"]));
      } else if (type == "demo") {
        if (s.tasks.Any(t => !t.completedAt.HasValue && !t.cancelledAt.HasValue)) throw new Exception("先完成现有便签，再体验示例。");
        string[] titles = { "完成今天的创作", "记得起来喝水", "把新的灵感记下来", "出门散散步" };
        int[] mins = { 120, 3, 300, 60 }; string[] cats = { "工作", "健康", "灵感", "生活" };
        for (int i = 0; i < 4; i++) s.tasks.Add(new Todo { id = Guid.NewGuid().ToString(), title = titles[i], note = "示例待办 · 做完之后，点击便签标记完成。", category = cats[i], color = Colors[i], dueAt = now + mins[i] * 60000, createdAt = now, demo = true });
      } else throw new Exception("不支持的待办操作。");
      Validate(s); return s;
    }
  }
  public class TaskStore {
    public readonly string FilePath; private State state; private readonly object gate = new object();
    public TaskStore(string folder) {
      Directory.CreateDirectory(folder); FilePath = IOPath.Combine(folder, "tasks-v2.json");
      var legacy=IOPath.Combine(folder,"tasks-v1.json");
      if(!File.Exists(FilePath)&&File.Exists(legacy)){var imported=new JavaScriptSerializer().Deserialize<State>(File.ReadAllText(legacy));Rules.Validate(imported);File.Copy(legacy,legacy+".migration-backup",true);AtomicFile.Write(FilePath,new JavaScriptSerializer().Serialize(imported));}
      state = File.Exists(FilePath) ? new JavaScriptSerializer().Deserialize<State>(File.ReadAllText(FilePath, Encoding.UTF8)) : new State();
      foreach(var task in state.tasks ?? new List<Todo>())
        if(task.demo && task.note=="示例待办 · 做完之后，点击衣服收好它。") task.note="示例便签 · 点击查看详情。";
      Rules.Validate(state);
    }
    public State Read() { lock (gate) return new JavaScriptSerializer().Deserialize<State>(new JavaScriptSerializer().Serialize(state)); }
    public string ReadJson() { lock (gate) return new JavaScriptSerializer().Serialize(state); }
    public State Command(string command) {
      lock (gate) {
        var next = Rules.Apply(state, command, Rules.Now());
        string temp = FilePath + ".tmp";
        var bytes = new UTF8Encoding(false).GetBytes(new JavaScriptSerializer().Serialize(next));
        using (var stream = new FileStream(temp, FileMode.Create, FileAccess.Write, FileShare.None)) { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); }
        if (File.Exists(FilePath)) File.Replace(temp, FilePath, FilePath + ".bak", true); else File.Move(temp, FilePath);
        state = next; return Read();
      }
    }
  }
  // Loopback-only host for the exported dashboard; no Node.js or internet is needed at runtime.
  public class LocalHost : IDisposable {
    private TcpListener listener; private volatile bool disposed; private readonly string root;
    private readonly Func<string> read; private readonly Func<string, string> write;
    public Func<string,string> companion;
    private readonly Action show;
    private readonly string token = Guid.NewGuid().ToString("N");
    public readonly string Origin;
    public LocalHost(string folder, Func<string> readState, Func<string, string> writeState, Action showWidget) {
      root = IOPath.GetFullPath(folder); read = readState; write = writeState; show = showWidget;
      listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
      Origin = "http://127.0.0.1:" + ((IPEndPoint)listener.LocalEndpoint).Port;
      listener.BeginAcceptTcpClient(Accept, null);
    }
    private void Accept(IAsyncResult result) {
      if (disposed) return;
      try {
        var client = listener.EndAcceptTcpClient(result);
        listener.BeginAcceptTcpClient(Accept, null);
        ThreadPool.QueueUserWorkItem(delegate { Handle(client); });
      } catch (ObjectDisposedException) {} catch (SocketException) {}
    }
    private void Reply(NetworkStream stream, int status, string type, byte[] body) {
      string head = "HTTP/1.1 " + status + (status == 200 ? " OK" : " Error") + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length + "\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n";
      byte[] headers = Encoding.ASCII.GetBytes(head); stream.Write(headers, 0, headers.Length); stream.Write(body, 0, body.Length);
    }
    private void Handle(TcpClient client) {
      using (client) {
        client.ReceiveTimeout = 5000; client.SendTimeout = 5000;
        try { using (var stream = client.GetStream()) {
          var header = new List<byte>();
          while (header.Count < 16384) {
            int b = stream.ReadByte(); if (b == -1) return; header.Add((byte)b);
            int n = header.Count; if (n >= 4 && header[n - 4] == 13 && header[n - 3] == 10 && header[n - 2] == 13 && header[n - 1] == 10) break;
          }
          if (header.Count >= 16384) return;
          string[] lines = Encoding.ASCII.GetString(header.ToArray()).Split(new[] { "\r\n" }, StringSplitOptions.None);
          string[] request = lines[0].Split(' '); if (request.Length != 3) return;
          var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
          foreach (string line in lines.Skip(1)) { int i = line.IndexOf(':'); if (i > 0) headers[line.Substring(0, i)] = line.Substring(i + 1).Trim(); }
          string host; if (!headers.TryGetValue("Host", out host) || host != new Uri(Origin).Authority) { Reply(stream, 403, "text/plain", Encoding.UTF8.GetBytes("Forbidden host")); return; }
          string path = Uri.UnescapeDataString(request[1].Split('?')[0]);
          if (path == "/api/laundry" || path == "/api/widget" || path == "/api/companion") {
            if (request[0] == "GET" && path == "/api/laundry") { Reply(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(read())); return; }
            int length; string rawLength;
            if (!headers.TryGetValue("Content-Length", out rawLength) || !Int32.TryParse(rawLength, out length) || length < 1 || length > (path=="/api/companion"?30000000:65536)) { Reply(stream, 400, "text/plain", new byte[0]); return; }
            byte[] body = new byte[length]; int at = 0;
            while (at < length) { int count = stream.Read(body, at, length - at); if (count == 0) return; at += count; }
            string sentToken, origin;
            if (request[0] != "POST" || !headers.TryGetValue("X-Clothesline-Token", out sentToken) || sentToken != token || (headers.TryGetValue("Origin", out origin) && origin != Origin)) { Reply(stream, 403, "text/plain", Encoding.UTF8.GetBytes("Forbidden request")); return; }
            if (path == "/api/widget") { show(); Reply(stream, 200, "application/json", Encoding.UTF8.GetBytes("{}")); return; }
            try { Reply(stream, 200, "application/json; charset=utf-8", Encoding.UTF8.GetBytes((path=="/api/companion"?companion:write)(Encoding.UTF8.GetString(body)))); }
            catch (Exception ex) { Reply(stream, 400, "application/json; charset=utf-8", Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(new { error = ex.Message }))); }
            return;
          }
          if(path.StartsWith("/assets/",StringComparison.Ordinal)) {
            var name=path.Substring(8);var asset=IOPath.Combine(assetRoot??root,name);
            if(!System.Text.RegularExpressions.Regex.IsMatch(name,@"^[a-f0-9]{64}\.(png|jpg|webp)$")||!File.Exists(asset)){Reply(stream,404,"text/plain",new byte[0]);return;}
            Reply(stream,200,name.EndsWith(".png")?"image/png":name.EndsWith(".jpg")?"image/jpeg":"image/webp",File.ReadAllBytes(asset));return;
          }
          if (request[0] != "GET") { Reply(stream, 405, "text/plain", new byte[0]); return; }
          string file = IOPath.GetFullPath(IOPath.Combine(root, path.TrimStart('/').Replace('/', IOPath.DirectorySeparatorChar)));
          if (path == "/") file = IOPath.Combine(root, "index.html");
          if (!file.StartsWith(root + IOPath.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(file)) { Reply(stream, 404, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("请先运行构建命令生成桌面看板。")); return; }
          string ext = IOPath.GetExtension(file).ToLowerInvariant();
          string mime = ext == ".html" ? "text/html; charset=utf-8" : (ext == ".js" || ext == ".mjs") ? "application/javascript; charset=utf-8" : ext == ".css" ? "text/css; charset=utf-8" : ext == ".svg" ? "image/svg+xml" : ext == ".jpg" ? "image/jpeg" : ext == ".png" ? "image/png" : ext == ".woff2" ? "font/woff2" : ext == ".wav" ? "audio/wav" : ext == ".wasm" ? "application/wasm" : ext == ".json" ? "application/json" : "application/octet-stream";
          var data = File.ReadAllBytes(file);
          if (path == "/" || path == "/index.html") data = Encoding.UTF8.GetBytes(Encoding.UTF8.GetString(data).Replace("<head>", "<head><meta name=\"clothesline-native\" content=\"" + token + "\">"));
          Reply(stream, 200, mime, data);
        }} catch (IOException) {} catch (SocketException) {} catch (Exception ex) { Debug.WriteLine(ex); }
      }
    }
    public string assetRoot;
    public void Dispose() { disposed = true; listener.Stop(); }
  }
  public class ClothBinding {
    public Todo task; public TextBlock time; public TextBlock badge; public int level = -1;
  }
  public partial class RackWindow : Window {
    private Canvas root = new Canvas(); private RackScene scene; private TaskStore store; private State state;
    private Forms.NotifyIcon tray; private LocalHost host; private readonly List<ClothBinding> bindings = new List<ClothBinding>();
    private DispatcherTimer timer; private bool exiting; private TextBlock status;
    private static readonly Brush Ink = BrushOf("#222730");
    public RackWindow(TaskStore taskStore, bool show) {
      store = taskStore; state = store.Read();
      Title = "晾一晾便签 · 桌面挂件"; Width = Math.Min(1100, SystemParameters.WorkArea.Width - 50); Height = 330;
      Left = SystemParameters.WorkArea.Left + (SystemParameters.WorkArea.Width - Width) / 2; Top = SystemParameters.WorkArea.Top;
      WindowStyle = WindowStyle.None; ResizeMode = ResizeMode.NoResize; AllowsTransparency = true; Background = Brushes.Transparent; Topmost = true; ShowInTaskbar = false;
      RenderOptions.SetBitmapScalingMode(root,BitmapScalingMode.HighQuality);TextOptions.SetTextFormattingMode(root,TextFormattingMode.Ideal);
      FontFamily = new FontFamily("Segoe UI, Microsoft YaHei"); Content = rigSurface; rigSurface.Children.Add(root); LoadAppearance();
      PreviewMouseWheel += delegate(object sender, MouseWheelEventArgs e) {
        if(Keyboard.Modifiers==ModifierKeys.Control && Mouse.Captured==null){ Zoom(Math.Sign(e.Delta));e.Handled=true; }
      };
      SourceInitialized += delegate { HwndSource.FromHwnd(new WindowInteropHelper(this).Handle).AddHook(HitTestHook); };
      Closing += delegate(object sender, System.ComponentModel.CancelEventArgs e) { if (!exiting) { e.Cancel = true; Hide(); } };
      BuildTray();
      host = new LocalHost(IOPath.Combine(AppDomain.CurrentDomain.BaseDirectory, "web"), store.ReadJson, command => Dispatcher.Invoke(delegate { Execute(command); return store.ReadJson(); }), () => Dispatcher.Invoke(ShowRack));
      host.assetRoot=IOPath.Combine(IOPath.GetDirectoryName(store.FilePath),"assets");
      LoadCompanions();
      IsVisibleChanged+=delegate{if(!IsVisible){if(activePhase!="overdue")StopActiveCue();if(scene!=null)scene.CancelInteraction();foreach(var member in crew)member.CancelInteraction();}};
      host.companion = payload => Dispatcher.Invoke(()=>CompanionCommand(payload));
      Rebuild();chromeTimer.Tick+=delegate{UpdateChrome();};chromeTimer.Start(); timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) }; timer.Tick += delegate { Tick(); }; timer.Start();
      if (!show) Loaded += delegate { Hide(); };
    }
    private IntPtr HitTestHook(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam, ref bool handled) {
      if((msg==0x7e || msg==0x02e0 || msg==0x1a) && IsLoaded && Left>-9000)Dispatcher.BeginInvoke(new Action(KeepHandleVisible));
      if(msg==0x1a&&IsLoaded)Dispatcher.BeginInvoke(new Action(SyncMotionPreference));
      if (msg == 0x84) {
        long pos = lParam.ToInt64(); var screen = new Point((short)(pos & 0xffff), (short)((pos >> 16) & 0xffff));
        if(Mouse.Captured!=null)return IntPtr.Zero;
        Point local = root.PointFromScreen(screen); var hit = root.InputHitTest(local);
        if (hit == null || hit == root) { handled = true; return new IntPtr(-1); }
      }
      return IntPtr.Zero;
    }
    public static SolidColorBrush BrushOf(string hex) { return (SolidColorBrush)new BrushConverter().ConvertFromString(hex); }
    private static TextBlock Text(string value, double size, string color) { return new TextBlock { Text = value, FontSize = size, Foreground = BrushOf(color), TextTrimming = TextTrimming.CharacterEllipsis, TextWrapping = TextWrapping.NoWrap }; }
    private static Button Btn(string title, Action click) {
      var b = new Button { Template=ToolbarTemplate,Content=title,Padding=new Thickness(12,7,12,7),Margin=new Thickness(2,3,2,3),Foreground=Ink,Background=BrushOf("#EEF0F5"),FontSize=13,Cursor=Cursors.Hand };
      b.Click += delegate { click(); }; return b;
    }
    private static readonly FontFamily MarkerFace = new FontFamily("Segoe Print, STXingkai, KaiTi, Microsoft YaHei");
    internal static ImageBrush Surface(string name) {
      var file = new Uri(IOPath.Combine(AppDomain.CurrentDomain.BaseDirectory,"web","rack-materials",name+".png"));
      return new ImageBrush(new System.Windows.Media.Imaging.BitmapImage(file)){ Stretch=Stretch.Fill };
    }
    private static readonly Dictionary<string,string> PaperCategories = new Dictionary<string,string> {
      {"工作","WORK"},{"生活","LIFE"},{"灵感","IDEAS"},{"健康","HEALTH"}
    };
    private static readonly ControlTemplate ToolbarTemplate = (ControlTemplate)System.Windows.Markup.XamlReader.Parse(@"
      <ControlTemplate xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation"" xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"" TargetType=""Button"">
        <Border x:Name=""pill"" CornerRadius=""16"" Background=""{TemplateBinding Background}"" Padding=""{TemplateBinding Padding}"" BorderBrush=""Transparent"" BorderThickness=""1"">
          <ContentPresenter HorizontalAlignment=""Center"" VerticalAlignment=""Center""/>
        </Border>
        <ControlTemplate.Triggers>
          <Trigger Property=""IsMouseOver"" Value=""True""><Setter TargetName=""pill"" Property=""Background"" Value=""#E8E7E3""/><Setter Property=""Foreground"" Value=""#202225""/></Trigger>
          <Trigger Property=""IsPressed"" Value=""True""><Setter TargetName=""pill"" Property=""Background"" Value=""#DAD9D5""/></Trigger>
          <Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""pill"" Property=""BorderBrush"" Value=""#7296D5""/></Trigger>
        </ControlTemplate.Triggers>
      </ControlTemplate>");
    private static Button ToolbarButton(string title, Action click, bool primary = false) {
      var button = new Button {
        Content = title, Height = 30, MinWidth = 30, Padding = new Thickness(9,0,9,0),
        Margin = new Thickness(1,0,1,0), FontSize = 13, FontWeight = FontWeights.SemiBold,
        Foreground = primary ? Brushes.White : Ink, Background = primary ? BrushOf("#254A9A") : Brushes.Transparent,
        Template = ToolbarTemplate, Cursor = Cursors.Hand
      };
      button.Click += delegate { click(); };
      return button;
    }
    private void Place(UIElement element, double left, double top) { Canvas.SetLeft(element, left); Canvas.SetTop(element, top); root.Children.Add(element); }
    private Border rackToolbar;
    readonly DispatcherTimer chromeTimer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(100)};
    bool controlsVisible;
    void UpdateChrome(){
      if(!IsVisible || rackToolbar==null || status==null)return;
      var cursor=Forms.Cursor.Position;
      var point=root.PointFromScreen(new Point(cursor.X,cursor.Y));
      bool inside=(point.X>=0 && point.X<=logicalWidth && point.Y>=0 && point.Y<=330) || Mouse.Captured!=null;
      if(inside==controlsVisible)return;controlsVisible=inside;
      foreach(var element in new UIElement[]{rackToolbar,status}){
        element.IsHitTestVisible=inside && element==rackToolbar;
        element.BeginAnimation(OpacityProperty,new System.Windows.Media.Animation.DoubleAnimation(inside?1:0,TimeSpan.FromMilliseconds(state.settings.reducedMotion?0:160)));
      }
    }
    private void Rebuild() {
      bool keepPursuit=pursuitRequested;
      string pursuitId=activePhase=="overdue"?activeCueId:null;
      StopActiveCue();if(scene!=null)scene.CancelInteraction();state = store.Read(); root.Children.Clear(); bindings.Clear();
      var active = state.tasks.Where(t => !t.completedAt.HasValue && !t.cancelledAt.HasValue).OrderBy(t => t.dueAt).ToList();
      var tools = new StackPanel { Orientation = Orientation.Horizontal, VerticalAlignment = VerticalAlignment.Center };
      var grip = Text("晾一晾便签",13,"#202225");
      grip.FontWeight = FontWeights.SemiBold; grip.VerticalAlignment = VerticalAlignment.Center;
      grip.Padding = new Thickness(12,4,10,4); grip.Cursor = Cursors.SizeAll; grip.ToolTip = "拖动桌面便签架";
      WireRackGrip(grip);
      tools.Children.Add(grip);
      if ((active.Count+(friends!=null&&friends.enabled?friends.displayedIds.Length:0)) * 176 > logicalWidth - 40) {
        var paging = new StackPanel { Orientation = Orientation.Horizontal };
        var previous = ToolbarButton("‹", () => scene.Slide(-1));
        var next = ToolbarButton("›", () => scene.Slide(1));
        previous.FontSize = next.FontSize = 18;
        previous.ToolTip = "上一件"; next.ToolTip = "下一件";
        System.Windows.Automation.AutomationProperties.SetName(previous,"上一件");
        System.Windows.Automation.AutomationProperties.SetName(next,"下一件");
        paging.Children.Add(previous); paging.Children.Add(next);
        tools.Children.Add(new Border { Child = paging, Background = BrushOf("#F0EFEC"), CornerRadius = new CornerRadius(16) });
      }
      tools.Children.Add(ToolbarButton("看板", OpenBoard));
      if(undoCompletionId!=null)tools.Children.Add(ToolbarButton("撤销完成",()=>SafeExecute(new JavaScriptSerializer().Serialize(new{type="restore",id=undoCompletionId}))));
      tools.Children.Add(ToolbarButton(Rules.Quiet(state,Rules.Now()) ? "恢复提醒" : "安静", ToggleQuiet));
      tools.Children.Add(ToolbarButton("外观",OpenAppearance));
      tools.Children.Add(ToolbarButton("收起", () => Hide()));
      tools.Children.Add(ToolbarButton("＋ 写便签", () => OpenForm(null), true));
      var toolbar = new Border { Child = tools, Background = BrushOf("#FDFCF9"), Padding = new Thickness(4),
        BorderBrush = BrushOf("#DCDAD4"), BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(22) };
      toolbar.Effect = new System.Windows.Media.Effects.DropShadowEffect { Color = Colors.Black, Opacity = .12, BlurRadius = 6, ShadowDepth = 2 };
      rackToolbar=toolbar;toolbar.Opacity=controlsVisible?1:0;toolbar.IsHitTestVisible=controlsVisible;
      toolbar.Measure(new Size(double.PositiveInfinity,double.PositiveInfinity));
      Place(toolbar,Math.Max(0,(logicalWidth-toolbar.DesiredSize.Width)/2),2);Panel.SetZIndex(toolbar,2000);
      double previousOffset=scene==null?0:scene.Offset;
      scene = new RackScene(logicalWidth, active.Count, 0, ReducedMotion, OpenDetail, id => SafeExecute(new JavaScriptSerializer().Serialize(new {type="complete",id=id})));
      scene.Width = logicalWidth; scene.Height = 328; Place(scene,0,0);
      scene.DeferLayout=true;
      MountCrew();
      foreach (var task in active) {
        var texture = new Uri(IOPath.Combine(AppDomain.CurrentDomain.BaseDirectory, "web", "memo-pads", task.color + ".png"));
        var paper = new Canvas { Width=150, Height=187.5, Background=new ImageBrush(new System.Windows.Media.Imaging.BitmapImage(texture)) { Stretch=Stretch.Fill } };
        Action<TextBlock,double,double,double> place=(item,x,y,w)=>{item.Width=w;Canvas.SetLeft(item,x);Canvas.SetTop(item,y);paper.Children.Add(item);};
        var label=Text(PaperCategories[task.category],9,"#FFFDF1"); label.FontFamily=MarkerFace; label.FontWeight=FontWeights.Bold; label.TextAlignment=TextAlignment.Center;
        var capsule=new Border{Child=label,Width=46,Height=16,Background=BrushOf("#203D84"),CornerRadius=new CornerRadius(12)};
        Canvas.SetLeft(capsule,7); Canvas.SetTop(capsule,6);paper.Children.Add(capsule);
        var reference=Text("# "+task.id.Substring(Math.Max(0,task.id.Length-6)).ToUpperInvariant(),9,"#374C74"); reference.FontFamily=new FontFamily("Consolas");place(reference,56,9,59);
        var title=Text(task.title,18,"#191F2C"); title.FontFamily=new FontFamily("Arial Black, Microsoft YaHei UI, Microsoft YaHei"); title.FontWeight=FontWeights.Bold;title.TextAlignment=TextAlignment.Center;title.TextWrapping=TextWrapping.Wrap;title.MaxHeight=43;place(title,8,31,134);
        var deadline=Text(Rules.Local(task.dueAt).ToString("MM/dd HH:mm"),10,"#24395C");deadline.FontFamily=new FontFamily("Consolas");place(deadline,9,80,134);
        var note=Text(task.note,10,"#28385C");place(note,9,94,131);
        var badge=Text("",19,"#202122");badge.FontFamily=MarkerFace;badge.FontWeight=FontWeights.Bold;badge.FontStyle=FontStyles.Italic;badge.TextAlignment=TextAlignment.Center;badge.TextDecorations=TextDecorations.Underline;badge.RenderTransform=new RotateTransform(-4);place(badge,11,121,126);
        var countdown=Text("",10,"#28385C");countdown.FontFamily=new FontFamily("Consolas, Microsoft YaHei UI");place(countdown,9,159,132);
        scene.Hang(task.id,paper);
        bindings.Add(new ClothBinding { task=task, time=countdown, badge=badge });
      }
      scene.DeferLayout=false;
      scene.ScrollTo(previousOffset);
      status = Text("", 9, "#7A7C80"); status.Opacity=controlsVisible?1:0; status.TextAlignment = TextAlignment.Center; status.Width = logicalWidth; status.IsHitTestVisible = false; Place(status, 0, 315);
      var pursuit=active.FirstOrDefault(t=>t.id==pursuitId);
      if(pursuit!=null&&(keepPursuit||(friends.enabled))&&!Rules.Quiet(state,Rules.Now()))
        ShowCue(pursuit,"overdue",Rules.Now(),keepPursuit);
      Tick();
    }
    private void Tick() {
      double now = Rules.Now();
      SyncMotionPreference();
      foreach (var b in bindings) {
        int level = Rules.Level(b.task, state.settings, now); b.time.Text = Rules.Countdown(b.task, now);
        b.time.Foreground = BrushOf(level >= 2 ? "#923321" : "#293B64"); b.badge.Text = level == 3 ? "OVERDUE!" : level == 2 ? "DUE SOON" : "NEXT UP";

        b.level = level;
      }
      UpdateCrew(now);
      int completed = state.tasks.Count(t => t.completedAt.HasValue && Rules.Local(t.completedAt.Value).Date == Rules.Local(now).Date);
      status.Text = (Rules.Quiet(state,Rules.Now()) ? "安静模式 · " : "") + bindings.Count + " 张待办  /  今日完成 " + completed + " 张  ·  单击查看 · 拖出投篓 · Ctrl＋滚轮缩放";
    }

    private void BuildTray() {
      tray = new Forms.NotifyIcon { Icon = Drawing.Icon.ExtractAssociatedIcon(System.Reflection.Assembly.GetExecutingAssembly().Location), Visible = true, Text = "晾一晾便签 v1.0 · 像素无限工作室出品" };
      var menu = new Forms.ContextMenuStrip();
      menu.Items.Add("显示便签架", null, delegate { Dispatcher.Invoke(ShowRack); });
      menu.Items.Add("隐藏便签架", null, delegate { Dispatcher.Invoke(Hide); });
      menu.Items.Add("新建便签", null, delegate { Dispatcher.Invoke(() => OpenForm(null)); });
      menu.Items.Add("打开待办看板", null, delegate { OpenBoard(); });
      menu.Items.Add("今日安静",null,delegate{Dispatcher.Invoke(QuietToday);});
      menu.Items.Add("安静 / 恢复提醒", null, delegate { Dispatcher.Invoke(ToggleQuiet); });
      menu.Items.Add("查看待办保存位置", null, delegate { Process.Start("explorer.exe", IOPath.GetDirectoryName(store.FilePath)); });
      menu.Items.Add(new Forms.ToolStripSeparator());
      menu.Items.Add("退出晾一晾", null, delegate { Dispatcher.Invoke(Exit); });
      tray.ContextMenuStrip = menu; tray.DoubleClick += delegate { Dispatcher.Invoke(ShowRack); };
      tray.BalloonTipClicked += delegate { Dispatcher.Invoke(ShowRack); };
    }
    public void ShowRack() { Show(); Topmost = true; Activate(); }
    private void ToggleQuiet() { var s = store.Read().settings; s.quiet = !Rules.Quiet(store.Read(),Rules.Now());s.quietUntil=0; SafeExecute(new JavaScriptSerializer().Serialize(new { type = "settings", input = s })); }
    private void OpenBoard() { OpenUrl(host.Origin + "/"); }
    private static void OpenUrl(string url) { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch (Exception e) { MessageBox.Show(e.Message, "无法打开看板"); } }
    string undoCompletionId;
    private void Execute(string command) {
      var c=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(command);string type=Convert.ToString(c["type"]),id=c.ContainsKey("id")?Convert.ToString(c["id"]):null;
      var previous=store.Read().tasks.FirstOrDefault(t=>t.id==id);store.Command(command);
      Friend replyMember=null;
      if(type=="complete"){
        undoCompletionId=id;
        if(previous!=null&&!previous.completedAt.HasValue&&friends.enabled){
          replyMember=CueMember(previous,activeCueId==id?activePhase:"done");
          if(replyMember!=null&&(activeCueId==null||activeCueId==id))replyUntil=Rules.Now()+5500;
        }
      }
      if(type=="restore"&&id==undoCompletionId)undoCompletionId=null;
      Rebuild();
      if(replyMember!=null){
        string line=Speech(replyMember,"done",previous,Rules.Now());
        int index=crewIds.IndexOf(replyMember.id);
        if(activeMemberId==replyMember.id&&chaseWindow!=null){
          chaseSpeech.Text=line;restoreChaseSpeechAt=Rules.Now()+5500;
        }else if(activeCueId==null||activeMemberId!=replyMember.id){
          if(index<0&&activeCueId==null){
            transientRig=MountMember(replyMember,true);index=crew.Count-1;
          }
          if(index>=0){scene.Reveal(crew[index],170);crew[index].Say(line);}
        }
      }
    }
    private void SafeExecute(string command) { try { Execute(command); } catch (Exception e) { MessageBox.Show(e.Message, "这件小事还没保存"); } }
    private Window Dialog(string title, double width) { return new Window { WindowStyle=WindowStyle.None, AllowsTransparency=true, Title = "晾一晾便签 · " + title, Width = width, SizeToContent = SizeToContent.Height, MaxHeight = SystemParameters.WorkArea.Height - 40, WindowStartupLocation = WindowStartupLocation.CenterScreen, ResizeMode = ResizeMode.NoResize, Background = Brushes.Transparent, Foreground = Ink, Topmost = true, FontFamily = new FontFamily("Segoe UI, Microsoft YaHei"), Owner = this }; }
    private void OpenDetail(string id) {
      var task = store.Read().tasks.FirstOrDefault(t => t.id == id && !t.completedAt.HasValue && !t.cancelledAt.HasValue); if (task == null) return;
      var window = Dialog("便签详情", 365); var content = new StackPanel { Margin = new Thickness(28, 24, 28, 25) };
      var title = Text(task.title, 20, "#222730"); title.TextWrapping = TextWrapping.Wrap; content.Children.Add(title);
      var paper = new Border {Width=130,Height=162,Margin=new Thickness(0,10,0,12),Background=new ImageBrush(LoadBitmap(IOPath.Combine(AppDomain.CurrentDomain.BaseDirectory,"web","memo-pads",task.color+".png"),240)){Stretch=Stretch.Fill}};
      var printed=new StackPanel {Margin=new Thickness(9)};printed.Children.Add(Text(PaperCategories[task.category],10,"#234480"));
      var headline=Text(task.title,14,"#20242C"); headline.TextWrapping=TextWrapping.Wrap;headline.MaxHeight=64;headline.FontWeight=FontWeights.Bold;headline.Margin=new Thickness(0,18,0,0);printed.Children.Add(headline);paper.Child=printed;content.Children.Add(paper);
      var time = Text(Rules.Countdown(task, Rules.Now()), 20, "#284F9A"); time.TextAlignment = TextAlignment.Center; content.Children.Add(time);
      var deadline = Text("截止 " + Rules.Local(task.dueAt).ToString("M月d日 HH:mm"), 11, "#656668"); deadline.Margin = new Thickness(0, 8, 0, 15); deadline.TextAlignment = TextAlignment.Center; content.Children.Add(deadline);
      var note = Text(String.IsNullOrWhiteSpace(task.note) ? "做完这件事，给自己腾出一点空间。" : task.note, 12, "#595C60"); note.TextWrapping = TextWrapping.Wrap; note.Margin = new Thickness(0, 0, 0, 20); content.Children.Add(note);
      content.Children.Add(ToolbarButton("✓ 完成便签", delegate {
        try { Execute(new JavaScriptSerializer().Serialize(new { type = "complete", id = task.id })); window.Close(); }
        catch (Exception e) { MessageBox.Show(e.Message, "保存失败"); }
      },true));
      content.Children.Add(Btn("开始处理 · 10 分钟免催",()=>{Execute(new JavaScriptSerializer().Serialize(new{type="start",id=task.id}));time.Text="正在处理 · 10 分钟免催";}));
      content.Children.Add(Btn("稍后 10 分钟",()=>{Execute(new JavaScriptSerializer().Serialize(new{type="snooze",id=task.id}));window.Close();}));
      content.Children.Add(Btn("取消任务",()=>{Execute(new JavaScriptSerializer().Serialize(new{type="cancel",id=task.id}));window.Close();}));
      var edit = Btn("修改安排", delegate { window.Close(); OpenForm(task); }); edit.Margin = new Thickness(3, 10, 3, 0); content.Children.Add(edit);
      
      var clock = new DispatcherTimer { Interval = TimeSpan.FromSeconds(1) }; clock.Tick += delegate { time.Text = Rules.Countdown(task, Rules.Now()); }; clock.Start();
      window.Closed += delegate { clock.Stop(); }; ShowSheet(window,content);
    }
    private void OpenForm(Todo task) {
      var window = Dialog(task == null ? "新建便签" : "编辑便签", 430);
      var panel = new StackPanel { Margin = new Thickness(27, 23, 27, 25) };

      Action<string> label = value => { var l = Text(value, 11, "#50545A"); l.Margin = new Thickness(0, 13, 0, 7); panel.Children.Add(l); };
      label("便签标题"); var name = new TextBox { Text = task == null ? "" : task.title, MaxLength = 60, Padding = new Thickness(9), FontSize = 13 }; panel.Children.Add(name);
      label("截止时间");
      var deadlineRow=new StackPanel {Orientation=Orientation.Horizontal};
      var date=new DatePicker{Width=146,SelectedDateFormat=DatePickerFormat.Short,FirstDayOfWeek=DayOfWeek.Monday};
      var hour=new ComboBox{Width=62,ItemsSource=Enumerable.Range(0,24).Select(n=>n.ToString("00")).ToArray()};
      var minute=new ComboBox{Width=62,ItemsSource=Enumerable.Range(0,60).Select(n=>n.ToString("00")).ToArray()};
      System.Windows.Automation.AutomationProperties.SetName(hour,"小时");
      System.Windows.Automation.AutomationProperties.SetName(minute,"分钟");
      deadlineRow.Children.Add(date);deadlineRow.Children.Add(hour);deadlineRow.Children.Add(Text(" ： ",16,"#454957"));deadlineRow.Children.Add(minute);panel.Children.Add(deadlineRow);
      Action<DateTime> choose=d=>{date.SelectedDate=d.Date;hour.SelectedIndex=d.Hour;minute.SelectedIndex=d.Minute;};
      choose(task==null?DateTime.Now.AddHours(1):Rules.Local(task.dueAt));
      var quick=new StackPanel{Orientation=Orientation.Horizontal,Margin=new Thickness(0,8,0,0)};
      foreach(int minutes in new[]{30,60,1440}){int delta=minutes;quick.Children.Add(Btn(delta==1440?"明天此时":delta+" 分钟",()=>choose(DateTime.Now.AddMinutes(delta))));}panel.Children.Add(quick);
      label("分类"); var category = new ComboBox { ItemsSource = Rules.Categories.Select(c=>PaperCategories[c]).ToArray(), SelectedIndex = task == null ? 0 : Array.IndexOf(Rules.Categories,task.category), Padding = new Thickness(7), FontSize = 12 }; panel.Children.Add(category);
      label("便签纸色"); var color = new ComboBox { ItemsSource = new[] { "鼠尾草绿", "薰衣草紫", "杏桃粉", "天空蓝", "奶油黄", "象牙白" }, SelectedIndex = task == null ? 0 : Array.IndexOf(Rules.Colors, task.color), Padding = new Thickness(7), FontSize = 12 }; panel.Children.Add(color);
      label("提醒搭子");var memberChoices=new[]{"默认搭子（跟随当前陪伴）"}.Concat(friends.members.Select(m=>m.name)).ToArray();var companion=new ComboBox{ItemsSource=memberChoices,SelectedIndex=task==null||String.IsNullOrEmpty(task.companionId)?0:Array.FindIndex(friends.members,m=>m.id==task.companionId)+1,Padding=new Thickness(7)};panel.Children.Add(companion);
      label("给自己留句话（选填）"); var note = new TextBox { Text = task == null ? "" : task.note, MaxLength = 500, Height = 65, TextWrapping = TextWrapping.Wrap, AcceptsReturn = true, Padding = new Thickness(9), FontSize = 12 }; panel.Children.Add(note);
      var error = Text("", 11, "#B77D59"); error.TextWrapping = TextWrapping.Wrap; error.Margin = new Thickness(0, 12, 0, 10); panel.Children.Add(error);
      panel.Children.Add(ToolbarButton(task == null ? "挂上便签" : "保存安排", delegate {
        try {
          if(!date.SelectedDate.HasValue)throw new Exception("请选择截止日期。");
          var deadline=date.SelectedDate.Value.Date.AddHours(hour.SelectedIndex).AddMinutes(minute.SelectedIndex);
          var input = new Todo { companionId=companion.SelectedIndex>0?friends.members[companion.SelectedIndex-1].id:null,title = name.Text.Trim(), note = note.Text, category = Rules.Categories[category.SelectedIndex], color = Rules.Colors[color.SelectedIndex], dueAt = (deadline.ToUniversalTime() - new DateTime(1970, 1, 1)).TotalMilliseconds };
          Execute(new JavaScriptSerializer().Serialize(new { type = task == null ? "add" : "update", id = task == null ? Guid.NewGuid().ToString() : task.id, input = input })); window.Close();
        } catch (Exception ex) { error.Text = ex.Message; }
      },true));
      window.Loaded += delegate { name.Focus(); }; ShowSheet(window,panel);
    }
    public void Exit() { if (exiting) return; exiting = true; StopActiveCue();chromeTimer.Stop(); timer.Stop(); tray.Visible = false; tray.Dispose(); host.Dispose(); Close(); Application.Current.Shutdown(); }
    public string BaseUrl { get { return host.Origin; } }
  }
  public static class Program {
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [STAThread] public static void Main(string[] args) {
      if (args.Contains("--self-test")) { SelfTest.Run(); return; }
      SetProcessDPIAware();
      bool fresh; using (var mutex = new Mutex(true, args.Contains("--smoke-test") ? null : "Local\\Clothesline.Desktop.v2", out fresh)) {
        if (!fresh) { MessageBox.Show("晾一晾已经在运行。请双击系统托盘里的图标显示便签架。", "晾一晾"); return; }
        try {
          string folder = Environment.GetEnvironmentVariable("CLOTHESLINE_DATA_DIR");
          if (String.IsNullOrWhiteSpace(folder)) folder = IOPath.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Clothesline");
          var app = new Application { ShutdownMode = ShutdownMode.OnExplicitShutdown };
          app.DispatcherUnhandledException += delegate(object sender, DispatcherUnhandledExceptionEventArgs e) { MessageBox.Show(e.Exception.Message, "晾一晾遇到了一个问题"); e.Handled = true; };
          var window = new RackWindow(new TaskStore(folder), !args.Contains("--hidden"));
          if (args.Contains("--smoke-test")) {
            window.Left = -10000; window.Top = -10000;
            File.WriteAllText(IOPath.Combine(folder, "smoke-url.txt"), window.BaseUrl);
            var capture = new DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
            capture.Tick += delegate {
              capture.Stop();
              var visual = (FrameworkElement)window.Content;
              var bitmap = new System.Windows.Media.Imaging.RenderTargetBitmap((int)window.Width, (int)window.Height, 96, 96, PixelFormats.Pbgra32);
              bitmap.Render(visual);
              var encoder = new System.Windows.Media.Imaging.PngBitmapEncoder(); encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(bitmap));
              using (var output = File.Create(IOPath.Combine(folder, "native-preview.png"))) encoder.Save(output);
            }; capture.Start();
            var quit = new DispatcherTimer { Interval = TimeSpan.FromSeconds(240) }; quit.Tick += delegate { quit.Stop(); window.Exit(); }; quit.Start();
          }
          app.Run(window);
        } catch (Exception ex) { MessageBox.Show("无法读取本机待办，原文件保持不变。\n" + ex.Message + "\n请备份 tasks-v2.json 后检查 .bak 文件。", "晾一晾启动失败"); Environment.ExitCode = 1; }
      }
    }
  }
  public static class SelfTest {
    public static void Run() {
      string folder = Environment.GetEnvironmentVariable("CLOTHESLINE_TEST_DIR") ?? IOPath.Combine(IOPath.GetTempPath(), "clothesline-test-" + Guid.NewGuid().ToString("N"));
      Directory.CreateDirectory(folder); string result = "";
      try {
        var s = new State(); double now = Rules.Now(); var serializer = new JavaScriptSerializer();
        var input = new Todo { title = "原生持久化测试", note = "", category = "工作", color = "sage", dueAt = now + 30000 };
        var add = serializer.Serialize(new { type = "add", id = "native-test", input = input });
        var store = new TaskStore(folder); store.Command(add);
        var restored = new TaskStore(folder).Read(); if (restored.tasks.Count != 1 || Rules.Level(restored.tasks[0], restored.settings, now) != 2) throw new Exception("倒计时或重启恢复失败");
        if (Rules.Level(restored.tasks[0], restored.settings, now + 31000) != 3) throw new Exception("超时判定失败");
        store.Command("{\"type\":\"complete\",\"id\":\"native-test\"}"); if (!new TaskStore(folder).Read().tasks[0].completedAt.HasValue) throw new Exception("完成状态没有保存");
        store.Command("{\"type\":\"restore\",\"id\":\"native-test\"}"); if (store.Read().tasks[0].completedAt.HasValue) throw new Exception("重新挂起失败");
        bool rejected = false; try { Rules.Apply(s, "{\"type\":\"delete\",\"id\":\"native-test\"}", now); } catch { rejected = true; } if (!rejected) throw new Exception("未完成任务可被非法移除");
        input.dueAt = now - 1000; rejected = false; try { Rules.Apply(s, serializer.Serialize(new { type = "add", id = "past", input = input }), now); } catch { rejected = true; } if (!rejected) throw new Exception("允许新建过去的截止时间");
        if (!File.Exists(store.FilePath + ".bak")) throw new Exception("原子备份缺失");
        result = "PASS: add, urgency, overdue, restart persistence, complete, restore, reject delete, reject past deadline, atomic backup";
      } catch (Exception ex) { result = "FAIL: " + ex; Environment.ExitCode = 1; }
      File.WriteAllText(IOPath.Combine(folder, "self-test-result.txt"), result, Encoding.UTF8);
    }
  }
}
