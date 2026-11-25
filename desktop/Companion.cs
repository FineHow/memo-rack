using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Input;
using System.Windows.Threading;
using Line = System.Windows.Shapes.Line;

namespace Clothesline {
  public sealed class WallMember {public string id {get;set;} public string template {get;set;} public string name {get;set;}}
  public sealed class BuddyStyle {
    public string id {get;set;} public string name {get;set;} public string art {get;set;}
    public string image{get;set;} public string opening{get;set;}
    public double[] face {get;set;} public double[] pins {get;set;}
  }
  // A single outline includes the tail, so it stays readable on light and dark desktops.
  public sealed class SpeechBubble : Border {
    static readonly Brush Ink=RackWindow.BrushOf("#252323");
    static readonly Brush Dots=new DrawingBrush(new GeometryDrawing(Ink,null,new EllipseGeometry(new Point(1,1),.9,.9))){
      TileMode=TileMode.Tile,ViewportUnits=BrushMappingMode.Absolute,Viewport=new Rect(0,0,4,4),
      ViewboxUnits=BrushMappingMode.Absolute,Viewbox=new Rect(0,0,4,4)};
    public SpeechBubble(string line){
      IsHitTestVisible=false;HorizontalAlignment=HorizontalAlignment.Center;
      Padding=new Thickness(14,8,15,19);
      Child=new TextBlock{Text=line,FontSize=13,MaxWidth=215,TextWrapping=TextWrapping.Wrap,Foreground=Ink};
    }
    protected override void OnRender(DrawingContext dc){
      double w=ActualWidth-5,h=ActualHeight-13;
      if(w<16||h<12)return;
      double r=Math.Min(18,h*.45),tail=Math.Min(w*.4,36);
      var g=new StreamGeometry();
      using(var c=g.Open()){
        c.BeginFigure(new Point(r,1.5),true,true);
        c.LineTo(new Point(w-r,1.5),true,false);c.QuadraticBezierTo(new Point(w,1.5),new Point(w,r),true,false);
        c.LineTo(new Point(w,h-r),true,false);c.QuadraticBezierTo(new Point(w,h),new Point(w-r,h),true,false);
        c.LineTo(new Point(tail+12,h),true,false);c.QuadraticBezierTo(new Point(tail+6,h+6),new Point(tail-4,h+9),true,false);
        c.QuadraticBezierTo(new Point(tail,h+4),new Point(tail,h),true,false);
        c.LineTo(new Point(r,h),true,false);c.QuadraticBezierTo(new Point(1.5,h),new Point(1.5,h-r),true,false);
        c.LineTo(new Point(1.5,r),true,false);c.QuadraticBezierTo(new Point(1.5,1.5),new Point(r,1.5),true,false);
      }
      dc.PushTransform(new TranslateTransform(3,3));dc.DrawGeometry(Dots,null,g);dc.Pop();
      dc.DrawGeometry(Brushes.White,new Pen(Ink,2.3){LineJoin=PenLineJoin.Round},g);
    }
  }
  public partial class RackWindow {
    BuddyStyle[] styles;
    string StickerPath {get{return Path.Combine(Path.GetDirectoryName(store.FilePath),"companion-sticker.png");}}
    BuddyStyle StyleForBuddy(string template=null) {
      if(styles==null) styles=new JavaScriptSerializer().Deserialize<BuddyStyle[]>(File.ReadAllText(BrandFile("cast.json")));
      return styles.FirstOrDefault(x=>x.id==(template??prefs.template))??styles[0];
    }
    bool StickerActive {get{return prefs.template=="custom" && File.Exists(StickerPath);}}
    static string DataUrl(string file){return File.Exists(file)?"data:image/png;base64,"+Convert.ToBase64String(File.ReadAllBytes(file)):"";}
    static void StoreUpload(string url,string file,int maxSize){
      const string prefix="data:image/png;base64,";
      if(url==null || !url.StartsWith(prefix,StringComparison.Ordinal))throw new Exception("请选择 PNG 图片。");
      var data=Convert.FromBase64String(url.Substring(prefix.Length));
      using(var input=new MemoryStream(data)){
        var image=new PngBitmapDecoder(input,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad).Frames[0];
        if(image.PixelWidth>maxSize || image.PixelHeight>maxSize)throw new Exception("图片尺寸过大。");
        var png=new PngBitmapEncoder();png.Frames.Add(BitmapFrame.Create(image));
        var temp=file+".tmp";using(var stream=File.Create(temp))png.Save(stream);
        if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);
      }
    }
    string CompanionCommand(string json){
      var ser=new JavaScriptSerializer{MaxJsonLength=30000000};var cmd=ser.Deserialize<Dictionary<string,string>>(json);string value;cmd.TryGetValue("value",out value);
      switch(cmd["action"]){
        case "read2":return ser.Serialize(friends);
        case "asset":{
          var comma=(value??"").IndexOf(',');if(comma<0)throw new Exception("照片无效");string ext=value.StartsWith("data:image/png;base64,")?"png":value.StartsWith("data:image/jpeg;base64,")?"jpg":value.StartsWith("data:image/webp;base64,")?"webp":null;
          if(ext==null)throw new Exception("请选择 PNG、JPG 或 WebP 图片");return ser.Serialize(new{ @ref=WriteAsset(Convert.FromBase64String(value.Substring(comma+1)),ext)});
        }
        case "save2":{
          var next=ser.Deserialize<Friends>(value);next.starterApplied=true;next.Validate();if(next.revision!=friends.revision)throw new Exception("其他窗口已更新搭子，请重新读取后编辑");
          foreach(var m in next.members)foreach(var r in new[]{m.original,m.working??"",m.repairSource??"",m.result,m.customDoll==null?"":m.customDoll.source,m.customDoll==null?"":m.customDoll.cutout,m.customDoll==null?"":m.customDoll.openingMask??""})if(r!=""&&!AssetHealthy(r))throw new Exception("照片素材缺失或损坏，请重新上传后重试；原设置仍然保留");
          next.revision++;AtomicFile.Write(FriendsPath,ser.Serialize(next));if(friends.enabled!=next.enabled||friends.currentId!=next.currentId||friends.autoChat!=next.autoChat||friends.chatSeconds!=next.chatSeconds)nextIdleChat=0;friends=next;Rebuild();return ser.Serialize(friends);
        }
        default:throw new Exception("请使用新版我的搭子设置；旧版写入已停止");
      }
    }
    string MemberFile(WallMember member){return Path.Combine(Path.GetDirectoryName(store.FilePath),"wall-"+member.id+".png");}
    readonly List<RackScene> crew=new List<RackScene>();
    readonly List<string> crewIds=new List<string>();
    string activeCueId,activePhase,activeMemberId;
    double cueUntil;
    readonly Random wordsRandom=new Random();
    Dialogue builtInLines;
    double nextIdleChat,replyUntil;
    Window chaseWindow;
    TextBlock chaseSpeech;
    string chaseLine;
    double restoreChaseSpeechAt;
    bool showingPursuit, pursuitRequested;
    RackScene transientRig;
    readonly DispatcherTimer chaseTimer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(16)};
    double chaseX,chaseY;
    bool ReducedMotion{get{return state.settings.reducedMotion||(Rules.TestReducedMotion??!SystemParameters.ClientAreaAnimation);}}
    void StopActiveCue(){
      chaseTimer.Stop();chaseSpeech=null;restoreChaseSpeechAt=0;showingPursuit=pursuitRequested=false;if(chaseWindow!=null){chaseWindow.Close();chaseWindow=null;}
      foreach(var c in crew){c.CancelInteraction();c.SetAlarm(0,"text",0);c.ClearSpeech();c.SetPresence(true);}
      if(transientRig!=null){var index=crew.IndexOf(transientRig);if(index>=0){crew.RemoveAt(index);crewIds.RemoveAt(index);}if(scene!=null)scene.RemoveMember(transientRig);transientRig=null;}
      activeCueId=activePhase=activeMemberId=null;cueUntil=0;
    }
    void SyncMotionPreference(){
      bool reduced=ReducedMotion;if(scene!=null)scene.SetReducedMotion(reduced);foreach(var c in crew)c.SetReducedMotion(reduced);

    }
    void QuietToday(){var setting=store.Read().settings;setting.quiet=false;setting.quietUntil=(Rules.Local(Rules.Now()).Date.AddDays(1).ToUniversalTime()-new DateTime(1970,1,1)).TotalMilliseconds;SafeExecute(new JavaScriptSerializer().Serialize(new{type="settings",input=setting}));}
    void MountCrew(){
      crew.Clear();crewIds.Clear();if(friends==null||!friends.enabled)return;
      var byId=friends.members.ToDictionary(member=>member.id);
      foreach(var id in friends.displayedIds){
        Friend m;if(!byId.TryGetValue(id,out m))continue;
        MountMember(m,false);
      }
    }
    RackScene MountMember(Friend m,bool guest){
      var art=FriendArt(m,170);
      var anchors=StyleForBuddy(m.template).pins;
      if(m.mode!="doll" || m.template=="uploaded"){
        var border=art as Border;
        var image=border==null?null:border.Child as Image;
        var bitmap=image==null?null:image.Source as BitmapSource;
        double ratio=bitmap==null?1:(double)bitmap.PixelWidth/bitmap.PixelHeight;
        double width=Math.Min(1,ratio),height=Math.Min(1,1/ratio);
        anchors=new[]{.5-.23*width,.5+.23*width,(1-height)+Math.Min(.025,m.edit.anchor*height)};
      }
      if(guest&&crew.Count>0)crew[0].SetPresence(false);
      var rig=scene.AddMember(art,anchors,true,()=>Chat(m),guest);
      rig.relief=friends.relief;
      if(!guest && m.id!=friends.currentId){rig.shiftSlot=delta=>ReorderFriend(m.id,delta);rig.AddSortGrip();}
      rig.SetAccessibleName(m.name);crew.Add(rig);crewIds.Add(m.id);
      return rig;
    }
    void ReorderFriend(string id,int delta){
      var order=friends.displayedIds.ToList();
      int from=order.IndexOf(id);
      if(id==friends.currentId||from<0||delta==0)return;
      int first=order.Contains(friends.currentId)?1:0;
      int to=Math.Max(first,Math.Min(order.Count-1,from+delta));
      if(to==from)return;
      order.RemoveAt(from);order.Insert(to,id);
      var serializer=new JavaScriptSerializer{MaxJsonLength=30000000};
      var next=serializer.Deserialize<Friends>(serializer.Serialize(friends));
      next.displayedIds=order.ToArray();
      try{CompanionCommand(serializer.Serialize(new{action="save2",value=serializer.Serialize(next)}));}
      catch(Exception error){var i=crewIds.IndexOf(id);if(i>=0)crew[i].Say(error.Message);}
    }
    FrameworkElement FriendArt(Friend m,double size){
      var photo=PhotoSource(m.result,1600);
      if(!String.IsNullOrEmpty(m.result)&&photo==null)return new Border{Width=size,Height=size,Background=Brushes.Transparent,Child=new TextBlock{Text="照片暂不可用\n请在我的搭子中重新编辑",TextWrapping=TextWrapping.Wrap,TextAlignment=TextAlignment.Center,VerticalAlignment=VerticalAlignment.Center,Foreground=Brushes.SlateGray,FontSize=12}};
      if(m.mode!="doll" || m.template=="uploaded")return new Border{Width=size,Height=size,BorderThickness=new Thickness(m.mode=="photo"&&m.edit.frame!="plain"?3:0),BorderBrush=m.edit.frame=="dark"?Brushes.DarkSlateGray:Brushes.White,Child=new Image{Source=photo,Width=size,Height=photo==null?size:size*Math.Min(1,(double)photo.PixelHeight/photo.PixelWidth),VerticalAlignment=VerticalAlignment.Bottom,Stretch=Stretch.Uniform}};
      var style=StyleForBuddy(m.template);
      var canvas=new Canvas{Width=size,Height=size};
      if(photo!=null){
        var face=style.face;
        double width=size*face[2],height=size*face[3];
        var portrait=new Image{Source=photo,Width=width,Height=height,Stretch=Stretch.UniformToFill,
          Clip=style.opening==null?new EllipseGeometry(new Rect(0,0,width,height)):null};
        Canvas.SetLeft(portrait,size*face[0]);Canvas.SetTop(portrait,size*face[1]);
        canvas.Children.Add(portrait);
      }
      var frame=new Image{Width=size,Height=size,Source=LoadBitmap(BrandFile(style.image??(style.art+(photo==null?".png":"-frame.png"))),480)};
      if(style.opening!=null && photo!=null){
        var outline=Geometry.Parse("F0 M0 0 H1 V1 H0 Z "+style.opening).Clone();
        outline.Transform=new ScaleTransform(size,size);
        frame.Clip=outline;
      }
      canvas.Children.Add(frame);
      return canvas;
    }
    void UpdateCrew(double now){
      if(friends==null)return;
      if(restoreChaseSpeechAt>0&&now>=restoreChaseSpeechAt&&chaseSpeech!=null){chaseSpeech.Text=chaseLine;restoreChaseSpeechAt=0;}
      if(activeCueId==null&&transientRig!=null&&now>=replyUntil)StopActiveCue();
      bool enabled=friends.enabled&&!Rules.Quiet(state,now);
      if(activeCueId!=null){
        var current=state.tasks.FirstOrDefault(t=>t.id==activeCueId);
        if((!pursuitRequested&&!enabled)||Rules.Quiet(state,now)||current==null||current.completedAt.HasValue||current.cancelledAt.HasValue)StopActiveCue();
        else if(activePhase=="overdue"){
          bool pursue=pursuitRequested&&!ReducedMotion;
          if(showingPursuit!=pursue||activeMemberId!=friends.currentId){
            bool requested=pursuitRequested;
            StopActiveCue();
            ShowCue(current,"overdue",now,requested);
          }
          return;
        }else if(!IsVisible||Rules.Phase(current,state,now)!=activePhase||now>=cueUntil)StopActiveCue();
        else return;
      }
      if(!IsVisible||!friends.enabled||Rules.Quiet(state,now))return;
      var task=Rules.NextReminder(state,now);
      if(task==null){if(now>=replyUntil)IdleChat(now);return;}
      var phase=Rules.Phase(task,state,now);
      if(CueMember(task,phase)==null)return;
      try{state=store.Command(new JavaScriptSerializer().Serialize(new{type="reminded",id=task.id,phase=phase,interval=friends.interval}));}catch(Exception e){System.Diagnostics.Debug.WriteLine(e);return;}
      ShowCue(task,phase,now);
    }
    Friend CueMember(Todo task,string phase){
      var id=phase=="overdue"||String.IsNullOrEmpty(task.companionId)?friends.currentId:task.companionId;
      return friends.members.FirstOrDefault(f=>f.id==id)??friends.members.FirstOrDefault(f=>f.id==friends.currentId);
    }
    void ShowCue(Todo task,string phase,double now,bool? keepPursuit=null){
      var m=CueMember(task,phase);if(m==null)return;
      activeCueId=task.id;activePhase=phase;activeMemberId=m.id;cueUntil=now+1000*friends.nearSeconds;
      scene.FocusMemo(task.id);
      string text=Speech(m,phase,task,now);
      var index=crewIds.IndexOf(m.id);
      if(index<0){transientRig=MountMember(m,true);index=crew.Count-1;}
      if(phase=="near"&&!ReducedMotion)for(int i=0;i<crew.Count;i++)if(friends.allMembers||i==index)crew[i].SetAlarm(2,friends.motion,i);
      pursuitRequested=phase=="overdue"&&(keepPursuit??friends.chaseEnabled);
      showingPursuit=pursuitRequested&&!ReducedMotion;
      if(showingPursuit){crew[index].SetPresence(false);StartChase(m,text);}
      else {scene.Reveal(crew[index],170);crew[index].SayReminder(text);}
    }
    string Speech(Friend m,string phase,Todo task,double now){
      if(builtInLines==null)builtInLines=new JavaScriptSerializer().Deserialize<Dialogue>(File.ReadAllText(BrandFile("dialogue.json")));
      var lines=m.dialogue==null?null:m.dialogue.Lines(phase);
      if(lines==null||lines.Length==0)lines=builtInLines.Lines(phase);
      var text=lines[wordsRandom.Next(lines.Length)];
      string remaining=task==null?"现在":(now>=task.dueAt?"已超时 ":"还有 ")+Math.Max(1,Math.Ceiling(Math.Abs(now-task.dueAt)/60000))+" 分钟";
      return System.Text.RegularExpressions.Regex.Replace(text,@"\{(姓名|任务名|剩余时间)\}",match=>
        match.Groups[1].Value=="姓名"?m.name:match.Groups[1].Value=="任务名"?(task==null?"眼前这件事":task.title):remaining);
    }
    string Chat(Friend m){
      var task=state.tasks.Where(t=>!t.completedAt.HasValue&&!t.cancelledAt.HasValue&&(String.IsNullOrEmpty(t.companionId)?friends.currentId:t.companionId)==m.id).OrderBy(t=>t.dueAt).FirstOrDefault();
      return Speech(m,"chat",task,Rules.Now());
    }
    void IdleChat(double now){
      if(!friends.autoChat){nextIdleChat=0;return;}
      // First enabled tick speaks immediately, subsequent ticks use the chosen interval.
      if(now<nextIdleChat)return;
      nextIdleChat=now+1000*friends.chatSeconds;
      int index=crewIds.IndexOf(friends.currentId);
      if(index>=0)crew[index].Say(Chat(friends.members.First(m=>m.id==friends.currentId)));
    }
    void StartChase(Friend member,string text){
      var art=FriendArt(member,210);
      var flip=new ScaleTransform(1,1);
      art.RenderTransformOrigin=new Point(.5,.5);art.RenderTransform=flip;
      var mirror=new System.Windows.Media.Animation.DoubleAnimationUsingKeyFrames{
        Duration=TimeSpan.FromMilliseconds(320),RepeatBehavior=System.Windows.Media.Animation.RepeatBehavior.Forever};
      mirror.KeyFrames.Add(new System.Windows.Media.Animation.DiscreteDoubleKeyFrame(1,TimeSpan.Zero));
      mirror.KeyFrames.Add(new System.Windows.Media.Animation.DiscreteDoubleKeyFrame(-1,TimeSpan.FromMilliseconds(160)));
      flip.BeginAnimation(ScaleTransform.ScaleXProperty,mirror);
      var bubble=new SpeechBubble(text);chaseSpeech=(TextBlock)bubble.Child;chaseLine=text;
      var panel=new StackPanel{IsHitTestVisible=false};panel.Children.Add(bubble);panel.Children.Add(art);
      chaseWindow=new Window{Content=panel,SizeToContent=SizeToContent.WidthAndHeight,WindowStyle=WindowStyle.None,
        AllowsTransparency=true,Background=Brushes.Transparent,Topmost=true,ShowInTaskbar=false,ShowActivated=false,
        Focusable=false,ResizeMode=ResizeMode.NoResize,IsHitTestVisible=false};
      chaseWindow.SourceInitialized+=delegate{
        var hwnd=new System.Windows.Interop.WindowInteropHelper(chaseWindow).Handle;
        SetWindowLongPhoto(hwnd,-20,GetWindowLongPhoto(hwnd,-20)|0x20|0x08000000|0x80);
      };
      chaseWindow.Show();FollowPhoto(true);chaseTimer.Tick-=ChaseTick;chaseTimer.Tick+=ChaseTick;chaseTimer.Start();
    }
    void ChaseTick(object sender,EventArgs e){if(chaseWindow!=null)FollowPhoto(false);}
    void FollowPhoto(bool immediate){
      var mouse=System.Windows.Forms.Cursor.Position;var screen=System.Windows.Forms.Screen.FromPoint(mouse).WorkingArea;
      var ps=PresentationSource.FromVisual(chaseWindow);var matrix=ps==null?Matrix.Identity:ps.CompositionTarget.TransformFromDevice;
      var cursor=matrix.Transform(new Point(mouse.X,mouse.Y));var low=matrix.Transform(new Point(screen.Left,screen.Top));var high=matrix.Transform(new Point(screen.Right,screen.Bottom));
      var area=new Rect(low,high);var extent=new Size(chaseWindow.ActualWidth,chaseWindow.ActualHeight);var target=DesktopPlacement.FollowTarget(cursor,area,extent);
      if(immediate){chaseX=target.X;chaseY=target.Y;}else{chaseX+=(target.X-chaseX)*.18;chaseY+=(target.Y-chaseY)*.18;}
      var visible=DesktopPlacement.Clamp(new Point(chaseX,chaseY),area,extent);chaseX=visible.X;chaseY=visible.Y;
      chaseWindow.Left=chaseX;chaseWindow.Top=chaseY;
    }
    [System.Runtime.InteropServices.DllImport("user32.dll",EntryPoint="GetWindowLongW")] static extern int GetWindowLongPhoto(IntPtr hwnd,int index);
    [System.Runtime.InteropServices.DllImport("user32.dll",EntryPoint="SetWindowLongW")] static extern int SetWindowLongPhoto(IntPtr hwnd,int index,int value);

  }
  public sealed partial class RackScene {
    bool memberSlot,present=true;
    int alarm,seat;
    string alarmMotion="spin";
    RackScene guestRig;
    public RackScene AddMember(FrameworkElement art,double[] anchors,bool speaker,Func<string> next,bool guest=false){
      bool replace=guest&&memberRigs.Count>0;
      var rig=new RackScene(PaperWidth,1,0,still,select,complete){Height=310,ClipToBounds=false,memberSlot=true};
      rig.Children.Clear();Children.Add(rig);
      if(replace)guestRig=rig;else memberRigs.Add(rig);
      rig.HangCompanion(art,170,anchors,next);SetZIndex(rig,4);ArrangeCards();return rig;
    }
    public void RemoveMember(RackScene rig){
      Children.Remove(rig);memberRigs.Remove(rig);if(guestRig==rig)guestRig=null;ArrangeCards();
    }
    public void SetAlarm(int level,string mode,int index){
      if(alarm==3 && level!=3 && !pulling){CloseBuddyOverlay();bodyX=bodyY=velocityX=velocityY=0;DrawBuddy();}
      alarm=level;alarmMotion=mode;seat=index;
      if(level==0&&!pulling){bodyX=bodyY=velocityX=velocityY=headAngle=headSpeed=0;if(body!=null)DrawBuddy();}
      if(!still && level>0 && IsVisible)StartSpring();
    }
    Canvas puppet;
    FrameworkElement body;
    Line leftCord,rightCord;
    Line[] cordTargets={new Line(),new Line()};
    double bodyX,bodyY,velocityX,velocityY;
    internal string relief="off";
    internal Action<int> shiftSlot;
    double flightTime, spin, spinRate, impactTime;
    bool detached;
    double windupTime,flightDuration,outsideTime,smackTime;
    const double Windup=.14, SmackDuration=.83, Gravity=620;
    static System.Media.SoundPlayer whoosh;
    static void PlayWhoosh(){
      try{
        if(whoosh==null)whoosh=new System.Media.SoundPlayer(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web","brand","sling-whoosh.wav"));
        whoosh.Play();
      }catch(System.IO.IOException){}catch(InvalidOperationException){}
    }
    Point releaseOffset;
    readonly Line[] impactRays=new Line[4];
    const double RestTop=65.5;
    readonly Line[] streaks=new Line[3];
    readonly System.Windows.Shapes.Ellipse[] aimDots=new System.Windows.Shapes.Ellipse[5];
    double[] pins;
    double buddySize;
    Point hand,pressOrigin;
    bool pulling,moved;
    double handTime,headAngle,headSpeed,breezeTime;
    FrameworkElement buddyArt;
    System.Windows.Interop.HwndSource buddyOverlay;
    Canvas overlayViewport;
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr handle,IntPtr after,int x,int y,int width,int height,uint flags);
    Canvas mirror;
    Border mirrorBubble;
    System.Windows.Shapes.Rectangle mirroredArt;
    Line[] extendedCords=new Line[2];
    void CloseBuddyOverlay(){
      if(buddyOverlay!=null){buddyOverlay.RootVisual=null;buddyOverlay.Dispose();buddyOverlay=null;overlayViewport=null;body.Opacity=leftCord.Opacity=rightCord.Opacity=1;if(bubble!=null)bubble.Opacity=1;}
    }
    void DrawBuddyOverlay(){
      if(buddyOverlay==null){
        mirror=new Canvas{IsHitTestVisible=false,ClipToBounds=true};
        for(int i=0;i<2;i++){extendedCords[i]=new Line{Stroke=leftCord.Stroke,StrokeThickness=1.6};mirror.Children.Add(extendedCords[i]);}
        for(int i=0;i<aimDots.Length;i++){
          double radius=7-i*.65;
          aimDots[i]=new System.Windows.Shapes.Ellipse{Width=radius,Height=radius,Fill=Brushes.White,Stroke=RackWindow.BrushOf("#487873"),StrokeThickness=1.1,Opacity=1-i*.12};
          mirror.Children.Add(aimDots[i]);
        }
        for(int i=0;i<streaks.Length;i++){
          streaks[i]=new Line{Stroke=RackWindow.BrushOf(i==1?"#FFAE46":"#49958E"),StrokeThickness=3-i*.5,StrokeStartLineCap=PenLineCap.Round,StrokeEndLineCap=PenLineCap.Round};
          mirror.Children.Add(streaks[i]);
        }
        mirroredArt=new System.Windows.Shapes.Rectangle{Width=buddySize,Height=buddySize,Fill=new VisualBrush(buddyArt){ViewboxUnits=BrushMappingMode.Absolute,Viewbox=new Rect(0,0,buddySize,buddySize),Stretch=Stretch.Fill}};
        mirror.Children.Add(mirroredArt);
        mirrorBubble=new SpeechBubble("");mirror.Children.Add(mirrorBubble);
        var options=new System.Windows.Interop.HwndSourceParameters("Clothesline companion gesture"){
          WindowStyle=unchecked((int)0x80000000), ExtendedWindowStyle=0x08000000|0x80|0x20|0x8,
          UsesPerPixelOpacity=true,Width=1,Height=1};
        buddyOverlay=new System.Windows.Interop.HwndSource(options){SizeToContent=SizeToContent.Manual};
        buddyOverlay.CompositionTarget.BackgroundColor=Colors.Transparent;
        overlayViewport=new Canvas{IsHitTestVisible=false,ClipToBounds=true};
        overlayViewport.Children.Add(mirror);buddyOverlay.RootVisual=overlayViewport;

      }
      var r=body.RenderTransform.TransformBounds(new Rect(0,0,buddySize,buddySize));r.Offset(GetLeft(body),GetTop(body));
      if(!detached && (alarm!=3 || pulling)){r.Union(new Point(leftCord.X1,0));r.Union(new Point(rightCord.X1,0));}r.Inflate(detached?42:3,detached?42:3);
      bool speaking=alarm==3 && bubble!=null && !pulling;
      mirrorBubble.Visibility=speaking?Visibility.Visible:Visibility.Collapsed;
      if(bubble!=null)bubble.Opacity=speaking?0:1;
      if(speaking){((TextBlock)mirrorBubble.Child).Text=((TextBlock)bubble.Child).Text;mirrorBubble.Measure(new Size(220,120));r.Y-=mirrorBubble.DesiredSize.Height;r.Height+=mirrorBubble.DesiredSize.Height;r.Width=Math.Max(r.Width,mirrorBubble.DesiredSize.Width);}

      // Popups can move themselves to fit the work area. Keep this drawing surface
      // in the same screen-pixel coordinates as the rail, including partially offscreen drags.
      Point origin=puppet.PointToScreen(r.TopLeft),end=puppet.PointToScreen(r.BottomRight);
      var desktop=System.Windows.Forms.SystemInformation.VirtualScreen;
      int left=Math.Max(desktop.Left,(int)Math.Floor(origin.X)),top=Math.Max(desktop.Top,(int)Math.Floor(origin.Y));
      int width=Math.Min(desktop.Right,(int)Math.Ceiling(end.X))-left,height=Math.Min(desktop.Bottom,(int)Math.Ceiling(end.Y))-top;
      bool visible=width>0&&height>0;
      SetWindowPos(buddyOverlay.Handle,new IntPtr(-1),left,top,Math.Max(1,width),Math.Max(1,height),0x10u|(visible?0x40u:0x80u));
      var dip=buddyOverlay.CompositionTarget.TransformFromDevice;
      var scale=dip.Transform(new Vector((end.X-origin.X)/r.Width,(end.Y-origin.Y)/r.Height));
      var offset=dip.Transform(new Vector(origin.X-left,origin.Y-top));
      mirror.Width=r.Width;mirror.Height=r.Height;
      mirror.RenderTransform=new ScaleTransform(scale.X,scale.Y);
      SetLeft(mirror,offset.X);SetTop(mirror,offset.Y);
      SetLeft(mirroredArt,GetLeft(body)-r.X);SetTop(mirroredArt,GetTop(body)-r.Y);mirroredArt.RenderTransform=body.RenderTransform;
      for(int i=0;i<2;i++){var from=i==0?leftCord:rightCord;var to=extendedCords[i];to.X1=from.X1-r.X;to.X2=from.X2-r.X;to.Y1=from.Y1-r.Y;to.Y2=from.Y2-r.Y;}
      double speed=Math.Max(1,Math.Sqrt(velocityX*velocityX+velocityY*velocityY));
      double pullLength=Math.Sqrt(bodyX*bodyX+bodyY*bodyY),duration;
      bool aiming=pulling && !still && (relief=="sling"||relief=="both") && pullLength>=45;
      var launchVector=aiming?LaunchVelocity(pullLength,out duration):new Vector();
      for(int i=0;i<aimDots.Length;i++){
        var dot=aimDots[i];
        dot.Visibility=aiming?Visibility.Visible:Visibility.Collapsed;
        if(!aiming)continue;
        double t=.065+i*.044;
        SetLeft(dot,GetLeft(mirroredArt)+buddySize*.5+launchVector.X*t-dot.Width/2);
        SetTop(dot,GetTop(mirroredArt)+buddySize*.5+launchVector.Y*t+.5*Gravity*t*t-dot.Height/2);
      }
      for(int i=0;i<streaks.Length;i++){
        var line=streaks[i];line.Visibility=flightTime>0 && windupTime==0?Visibility.Visible:Visibility.Collapsed;
        double dx=velocityX/speed,dy=velocityY/speed,side=(i-1)*16;
        double cx=GetLeft(mirroredArt)+buddySize*.5,cy=GetTop(mirroredArt)+buddySize*.5;
        line.X1=cx-dx*76-dy*side;line.Y1=cy-dy*76+dx*side;
        double tail=Math.Min(40,speed*.025)*(i==1?1:.65);
        line.X2=line.X1-dx*tail;line.Y2=line.Y1-dy*tail;
      }
      foreach(var cord in extendedCords)cord.Visibility=detached?Visibility.Collapsed:Visibility.Visible;
      body.Opacity=0;leftCord.Opacity=rightCord.Opacity=detached?1:0;
    }
    public void SetAccessibleName(string name){System.Windows.Automation.AutomationProperties.SetName(body,name);}
    Border bubble;
    readonly DispatcherTimer bubbleTimer=new DispatcherTimer{Interval=TimeSpan.FromSeconds(5)};
    public void Say(string text){
      if(puppet==null||reminderSpeaking)return;
      if(bubble!=null)Children.Remove(bubble);
      bubble=new SpeechBubble(text);
      bubble.Measure(new Size(245,double.PositiveInfinity));
      SetLeft(bubble,Math.Max(0,(PaperWidth-bubble.DesiredSize.Width)/2+14));
      SetTop(bubble,Math.Max(0,RailTop+49-bubble.DesiredSize.Height));
      SetZIndex(bubble,9);Children.Add(bubble);bubbleTimer.Stop();bubbleTimer.Start();
    }
    public void ClearSpeech(){reminderSpeaking=false;bubbleTimer.Stop();if(bubble!=null){Children.Remove(bubble);bubble=null;}}
    public void SetPresence(bool visible){
      if(!visible)CancelInteraction();
      present=visible;if(puppet!=null){puppet.Opacity=visible?1:0;puppet.IsHitTestVisible=visible;}
      if(visible&&!still&&IsVisible&&body!=null)StartSpring();
    }
    bool reminderSpeaking;
    public void SayReminder(string text){
      ClearSpeech();
      Say(text);
      bubbleTimer.Stop();
      reminderSpeaking=true;
    }
    void RigBuddy(FrameworkElement artwork,double size,double[] anchors,Func<string> nextTask){
      pins=anchors;buddySize=size;
      var holder=new StackPanel{Width=PaperWidth,RenderTransform=new RotateTransform()};
      puppet=new Canvas{Width=PaperWidth,Height=250,Cursor=Cursors.Hand,ForceCursor=true,ToolTip="拖动搭子，点一下聊天"};
      holder.Children.Add(puppet); cards.Add(holder);Children.Add(holder);SetTop(holder,RailTop+5);ArrangeCards();
      leftCord=new Line();rightCord=new Line();
      foreach(var target in cordTargets){target.Stroke=Brushes.Transparent;target.StrokeThickness=14;puppet.Children.Add(target);}
      foreach(var cord in new[]{leftCord,rightCord}){cord.Stroke=RackWindow.BrushOf("#878E98");cord.StrokeThickness=1.6;puppet.Children.Add(cord);}
      artwork.IsHitTestVisible=false;buddyArt=artwork;body=new Border{Cursor=Cursors.Hand,Width=size,Height=size,Child=artwork,Background=Brushes.Transparent};body.IsHitTestVisible=true;puppet.Children.Add(body);
      for(int i=0;i<2;i++){
        double pin=(PaperWidth-size)/2+pins[i]*size;
        var hook=new Canvas{Width=12,Height=18,IsHitTestVisible=false};
        Wire(hook,"M1,4 C3,-1 11,0 10,7 C10,12 6,13 6,17",1.5);
        SetLeft(hook,pin-6);SetTop(hook,-9);puppet.Children.Add(hook);
      }
      for(int i=0;i<impactRays.Length;i++){
        impactRays[i]=new Line{Stroke=RackWindow.BrushOf(i%2==0?"#E99A35":"#237D76"),StrokeThickness=3,StrokeStartLineCap=PenLineCap.Round,StrokeEndLineCap=PenLineCap.Round,IsHitTestVisible=false,Visibility=Visibility.Collapsed};
        puppet.Children.Add(impactRays[i]);
      }
      DrawBuddy();
      puppet.MouseLeftButtonDown+=delegate(object sender,MouseButtonEventArgs e){
        detached=false;flightTime=windupTime=outsideTime=smackTime=spin=impactTime=0;pressOrigin=e.GetPosition(this);hand=pressOrigin-new Vector(bodyX,bodyY);handTime=clock.Elapsed.TotalSeconds;pulling=true;moved=false;velocityX=velocityY=0;puppet.CaptureMouse();e.Handled=true;
      };
      puppet.MouseMove+=delegate(object sender,MouseEventArgs e){
        if(!pulling)return;var pointer=e.GetPosition(this);var d=pointer-hand;if((pointer-pressOrigin).Length>3)moved=true;
        double now=clock.Elapsed.TotalSeconds,dt=Math.Max(.012,now-handTime);handTime=now;
        velocityX=Math.Max(-650,Math.Min(650,(d.X-bodyX)/dt));velocityY=Math.Max(-650,Math.Min(650,(d.Y-bodyY)/dt));
        bodyX=d.X;bodyY=d.Y;
        if(moved){DrawBuddy();DrawBuddyOverlay();}e.Handled=true;
      };
      puppet.MouseLeftButtonUp+=delegate(object sender,MouseButtonEventArgs e){
        if(!pulling)return;
        if(moved)LaunchBuddy();
        else{
          Say(nextTask());
          if(!still && (relief=="slap"||relief=="both")){velocityX=650;velocityY=-215;headSpeed=185;impactTime=.42;smackTime=SmackDuration;}
        }
        puppet.ReleaseMouseCapture();e.Handled=true;
      };
      puppet.LostMouseCapture+=delegate{pulling=false;if(still){bodyX=bodyY=0;DrawBuddy();CloseBuddyOverlay();}else StartSpring();};
      puppet.MouseRightButtonUp+=delegate(object sender,MouseButtonEventArgs e){
        Say(nextTask());if(!still){velocityY=-160;headSpeed=48;StartSpring();}e.Handled=true;};
      if(!still)StartSpring();
      bubbleTimer.Tick+=delegate{ClearSpeech();};
      Unloaded+=delegate{bubbleTimer.Stop();};
    }
    internal void AddSortGrip(){
      var grip=new Border{Width=buddySize*.62,Height=23,Background=Brushes.Transparent,Cursor=Cursors.SizeWE,ForceCursor=true,ToolTip="沿杆拖动挂钩，调整搭子顺序"};
      SetLeft(grip,(PaperWidth-grip.Width)/2);SetTop(grip,-8);puppet.Children.Add(grip);
      double start=0;
      grip.MouseLeftButtonDown+=delegate(object sender,MouseButtonEventArgs e){start=e.GetPosition(this).X;grip.CaptureMouse();e.Handled=true;};
      grip.MouseLeftButtonUp+=delegate(object sender,MouseButtonEventArgs e){
        if(!grip.IsMouseCaptured)return;
        int delta=(int)Math.Round((e.GetPosition(this).X-start)/Space);grip.ReleaseMouseCapture();e.Handled=true;
        if(delta!=0)Dispatcher.BeginInvoke(new Action(()=>shiftSlot(delta)));
      };
    }
    double Recoil(){
      if(flightTime<=0 || windupTime>0)return 0;
      double time=flightDuration-flightTime;
      return Math.Exp(-22*time)*Math.Cos(23*time);
    }
    Vector LaunchVelocity(double length,out double duration){
      var screen=System.Windows.Forms.SystemInformation.VirtualScreen;
      var low=puppet.PointFromScreen(new Point(screen.Left,screen.Top));
      var high=puppet.PointFromScreen(new Point(screen.Right,screen.Bottom));
      var direction=new Vector(-bodyX/length,-bodyY/length);
      var center=new Point(PaperWidth/2+bodyX,RestTop+buddySize/2+bodyY);
      // Extend the ray beyond the last visible corner, even for a short pull.
      double margin=buddySize*1.6;
      double tx=Math.Abs(direction.X)<.0001?double.PositiveInfinity:((direction.X>0?high.X+margin:low.X-margin)-center.X)/direction.X;
      double ty=Math.Abs(direction.Y)<.0001?double.PositiveInfinity:((direction.Y>0?high.Y+margin:low.Y-margin)-center.Y)/direction.Y;
      double travel=Math.Max(180,Math.Min(tx,ty));
      duration=Math.Max(.25,Math.Min(.86,travel/(1350+Math.Min(length,900)*3)));
      return direction*(travel/duration)-new Vector(0,Gravity*duration/2);
    }
    bool LaunchBuddy(){
      double length=Math.Sqrt(bodyX*bodyX+bodyY*bodyY);
      if(still || (relief!="sling"&&relief!="both") || length<45)return false;
      var shot=LaunchVelocity(length,out flightDuration);
      velocityX=shot.X;velocityY=shot.Y;
      spinRate=(bodyX>0?-1:1)*(560+Math.Min(length,650));
      releaseOffset=new Point(bodyX,bodyY);windupTime=Windup;detached=false;flightTime=flightDuration;outsideTime=.16;
      spin=0;PlayWhoosh();return true;
    }
    void StartSpring(){if(!timer.IsEnabled){lastFrame=clock.Elapsed.TotalSeconds;timer.Start();}}
    bool StepBuddy(double dt){
      if(body==null || pulling || still || !present)return false;
      breezeTime+=dt;
      double breeze=buddyOverlay==null?Math.Sin(breezeTime*1.08)*1.8+Math.Sin(breezeTime*.71)*.8:0;
      if(windupTime>0){
        windupTime=Math.Max(0,windupTime-dt);
        double wave=Math.Sin((Windup-windupTime)*157)*windupTime/Windup;
        bodyX=releaseOffset.X+7*wave;spin=12*wave;
        if(windupTime==0)detached=true;
        DrawBuddy();DrawBuddyOverlay();return true;
      }
      if(flightTime>0){
        double step=Math.Min(dt,flightTime);flightTime-=step;
        bodyX+=velocityX*step;bodyY+=velocityY*step+.5*Gravity*step*step;
        velocityY+=Gravity*step;spin+=spinRate*step;
        if(flightTime==0){spin=((spin%360)+540)%360-180;velocityX=velocityY=0;}
        DrawBuddy();DrawBuddyOverlay();return true;
      }
      if(outsideTime>0){outsideTime=Math.Max(0,outsideTime-dt);return true;}
      impactTime=Math.Max(0,impactTime-dt);
      if(smackTime>0){
        smackTime=Math.Max(0,smackTime-dt);
        spin=720*(1-Math.Pow(smackTime/SmackDuration,2));
        if(smackTime==0)spin=0;
      }else spin*=Math.Exp(-8*dt);
      double dampingX=relief=="off"?7.5:12,dampingY=relief=="off"?8:13;
      velocityX+=(56*(breeze-bodyX)+gust*92-dampingX*velocityX)*dt;velocityY+=(-68*bodyY-dampingY*velocityY)*dt;
      headSpeed+=(-74*headAngle-8*headSpeed+velocityX*.95)*dt;headAngle+=headSpeed*dt;
      bodyX+=velocityX*dt;bodyY+=velocityY*dt;
      bool moving=Math.Abs(bodyX)+Math.Abs(bodyY)+Math.Abs(velocityX)+Math.Abs(velocityY)>.12;
      if(!moving){bodyX=bodyY=velocityX=velocityY=0;}
      DrawBuddy();
      if(buddyOverlay!=null){
        // Hand back to the live rack as soon as the whole returning character fits.
        var bounds=body.TransformToAncestor(this).TransformBounds(new Rect(0,0,buddySize,buddySize));
        if((!detached || Math.Abs(bodyX)+Math.Abs(bodyY)<5) && new Rect(0,0,ActualWidth,ActualHeight).Contains(bounds) || !moving){detached=false;spin=0;CloseBuddyOverlay();DrawBuddy();}
        else DrawBuddyOverlay();
      }
      return true;
    }
    void DrawBuddy(){
      double x=(PaperWidth-buddySize)/2,y=RestTop;
      double dx=bodyX,dy=bodyY;
      double tilt=Math.Atan(bodyX/125)*29+spin+impactTime*headAngle*2;
      var transform=new TransformGroup();
      if(alarm==2 && !still && !pulling && !detached){
        double t=breezeTime+seat*.13;
        double theta=alarmMotion=="swing"?Math.Sin(t*4.8)*.77:alarmMotion=="lash"?Math.Sin(t*9)*.48:0;
        double length=y+pins[2]*buddySize-8;
        dx+=length*Math.Sin(theta);dy+=length*(Math.Cos(theta)-1);
      }
      bool flipped=alarm==2 && alarmMotion=="mirror" && !still && !pulling && !detached && Math.Cos((breezeTime+seat*.13)*13)<0;
      if(flipped)transform.Children.Add(new ScaleTransform(-1,1,buddySize*.5,buddySize*pins[2]));
      transform.Children.Add(new RotateTransform(tilt,buddySize*.5,buddySize*pins[2]));
      SetLeft(body,x+dx);SetTop(body,y+dy);body.RenderTransform=transform;
      for(int i=0;i<impactRays.Length;i++){
        var ray=impactRays[i];ray.Visibility=impactTime>0?Visibility.Visible:Visibility.Collapsed;
        if(impactTime<=0)continue;
        double angle=(155+i*17)*Math.PI/180, progress=1-impactTime/.42, radius=12+progress*17;
        double cx=x+dx+buddySize*.22,cy=y+dy+buddySize*.34;
        ray.X1=cx+Math.Cos(angle)*radius;ray.Y1=cy+Math.Sin(angle)*radius;
        ray.X2=ray.X1+Math.Cos(angle)*12*(1-progress);ray.Y2=ray.Y1+Math.Sin(angle)*12*(1-progress);
        ray.Opacity=1-progress;
      }
      var cords=new[]{leftCord,rightCord};
      for(int i=0;i<2;i++){
        var corner=transform.Transform(new Point(pins[flipped?1-i:i]*buddySize,pins[2]*buddySize));
        cords[i].X1=x+pins[i]*buddySize;cords[i].Y1=8;cords[i].X2=detached?cords[i].X1+releaseOffset.X*Recoil():x+dx+corner.X;
        cords[i].Y2=detached?y+pins[2]*buddySize+releaseOffset.Y*Recoil():y+dy+corner.Y;
        var hit=cordTargets[i];hit.X1=cords[i].X1;hit.X2=cords[i].X2;hit.Y1=cords[i].Y1;hit.Y2=cords[i].Y2;
      }
    }
  }
}
