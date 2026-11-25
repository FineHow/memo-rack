using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using Clothesline;
class ReminderChecks {
  [System.Runtime.InteropServices.DllImport("user32.dll")]static extern IntPtr GetForegroundWindow();
  [System.Runtime.InteropServices.DllImport("user32.dll",EntryPoint="GetWindowLongW")]static extern int GetExtendedStyle(IntPtr hwnd,int index);
  static object Field(object o,string name){return o.GetType().GetField(name,BindingFlags.Instance|BindingFlags.NonPublic).GetValue(o);}
  static object Call(object o,string name,params object[] args){return o.GetType().GetMethod(name,BindingFlags.Instance|BindingFlags.NonPublic).Invoke(o,args);}
  static void Check(bool yes,string text){if(!yes)throw new Exception(text);}
  static void Pump(int ms){var f=new DispatcherFrame();var t=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(ms)};t.Tick+=delegate{t.Stop();f.Continue=false;};t.Start();Dispatcher.PushFrame(f);}
  static void Shot(Window w,string path){w.UpdateLayout();var b=new RenderTargetBitmap((int)Math.Ceiling(w.ActualWidth),(int)Math.Ceiling(w.ActualHeight),96,96,PixelFormats.Pbgra32);b.Render((Visual)w.Content);var e=new PngBitmapEncoder();e.Frames.Add(BitmapFrame.Create(b));using(var f=File.Create(path))e.Save(f);}
  [STAThread] static int Main(string[] args){RackWindow rack=null;try{
    Rules.TestReducedMotion=false;var app=new Application{ShutdownMode=ShutdownMode.OnExplicitShutdown};var serializer=new JavaScriptSerializer();
    var contract=serializer.DeserializeObject(File.ReadAllText(args[0])) as System.Collections.Generic.Dictionary<string,object>;
    double now=Convert.ToDouble(contract["now"]),due=Convert.ToDouble(contract["due"]);Rules.TestTime=now;
    var s=new State();var input=new Todo{title="报价单",note="",category="工作",color="sage",dueAt=due};
    s=Rules.Apply(s,serializer.Serialize(new{type="add",id="a",input=input}),now);
    foreach(System.Collections.Generic.Dictionary<string,object> row in (object[])contract["boundaries"])Check(Rules.Phase(s.tasks[0],s,Convert.ToDouble(row["at"]))==Convert.ToString(row["phase"]),Convert.ToString(row["name"]));
    var fair=Rules.Apply(s,serializer.Serialize(new{type="add",id="b",input=new Todo{title="新到期",note="",category="工作",color="blue",dueAt=due+1000}}),now);
    fair=Rules.Apply(fair,serializer.Serialize(new{type="reminded",id="a",phase="overdue",interval=60}),due);
    Check(Rules.NextReminder(fair,due).id=="b","new task is not starved by old overdue task");
    fair=Rules.Apply(fair,serializer.Serialize(new{type="start",id="a"}),due);Check(fair.currentTaskId=="a"&&fair.tasks[0].dueAt==due&&Rules.NextReminder(fair,due).id=="b","processing exempts only its own task");
    fair.settings.quietUntil=due+60000;Check(Rules.NextReminder(fair,due)==null,"quiet suppresses all automatic candidates");fair.settings.quietUntil=0;
    fair=Rules.Apply(fair,serializer.Serialize(new{type="cancel",id="b"}),due);Check(!fair.tasks[1].completedAt.HasValue&&Rules.NextReminder(fair,due)==null,"cancel is separate from completion");
    for(int orientation=1;orientation<=8;orientation++){
      var baseFile=Path.Combine(Path.GetDirectoryName(args[0]),"fixtures","photos","exif","orientation-"+orientation);
      var read=typeof(RackWindow).GetMethod("LoadBitmap",BindingFlags.Static|BindingFlags.NonPublic);var actual=(BitmapSource)read.Invoke(null,new object[]{baseFile+".jpg",300});var expected=(BitmapSource)read.Invoke(null,new object[]{baseFile+".png",orientation>=5?150:300});
      Check(actual.PixelWidth==expected.PixelWidth&&actual.PixelHeight==expected.PixelHeight,"EXIF dimensions match browser-confirmed orientation "+orientation);
      var ap=new FormatConvertedBitmap(actual,PixelFormats.Bgra32,null,0);var ep=new FormatConvertedBitmap(expected,PixelFormats.Bgra32,null,0);
      foreach(var pt in new[]{new Point(.25,.25),new Point(.75,.25),new Point(.25,.75),new Point(.75,.75)}){var rect=new Int32Rect((int)(actual.PixelWidth*pt.X),(int)(actual.PixelHeight*pt.Y),1,1);var av=new byte[4];var ev=new byte[4];ap.CopyPixels(rect,av,4,0);ep.CopyPixels(rect,ev,4,0);for(int c=0;c<3;c++)Check(Math.Abs(av[c]-ev[c])<15,"EXIF pixel direction "+orientation);}
    }
    var folder=Path.Combine(Path.GetTempPath(),"clothesline-reminders-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);var store=new TaskStore(folder);
    rack=new RackWindow(store,true){ShowActivated=false,Left=-9000,Top=-9000};rack.Show();Pump(100);
    var command=rack.GetType().GetMethod("CompanionCommand",BindingFlags.Instance|BindingFlags.NonPublic);
    Func<string,string,string> api=(action,value)=>(string)command.Invoke(rack,new object[]{serializer.Serialize(new{action=action,value=value})});
    var photo=new RenderTargetBitmap(300,150,96,96,PixelFormats.Pbgra32);var visual=new DrawingVisual();using(var dc=visual.RenderOpen()){dc.DrawRectangle(Brushes.SteelBlue,null,new Rect(0,0,300,150));dc.DrawEllipse(Brushes.Gold,null,new Point(90,75),35,45);}photo.Render(visual);var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(photo));string data;using(var stream=new MemoryStream()){encoder.Save(stream);data="data:image/png;base64,"+Convert.ToBase64String(stream.ToArray());}
    var asset=serializer.Deserialize<System.Collections.Generic.Dictionary<string,string>>(api("asset",data))["ref"];
    var friends=serializer.Deserialize<Friends>(api("read2",""));
    Check(friends.members.Length==1&&friends.currentId==friends.members[0].id&&friends.members[0].mode=="photo"&&friends.enabled&&friends.reminders&&friends.autoChat&&friends.chaseEnabled&&friends.allMembers&&friends.motion=="mirror"&&friends.relief=="sling","first launch uses the cat photo and enables mirrored reminders and sling");
    var catArt=(Border)Call(rack,"FriendArt",friends.members[0],170d);Check(((Image)catArt.Child).Source!=null,"packaged starter cat loads on the Windows rack");
    var cutCat=(Canvas)Call(rack,"FriendArt",new Friend{template="cat",result=asset},200d);
    var catFrame=(Image)cutCat.Children[1];Check(catFrame.Source!=null&&!catFrame.Clip.FillContains(new Point(100,96))&&catFrame.Clip.FillContains(new Point(100,178)),"cat frame exposes face and keeps body");
    Check(((System.Collections.Generic.List<ClothBinding>)Field(rack,"bindings")).Count==0,"no synthetic task on empty rack");
    var own=new Friend{id="custom-test",name="自己的小人",template="uploaded",mode="doll",original=asset,working=asset,result=asset,customDoll=new CustomDoll{source=asset,cutout=asset,opening=new[]{new[]{.3,.2},new[]{.6,.25},new[]{.45,.45}}}};
    friends.members=new[]{own};friends.displayedIds=new[]{own.id};friends.currentId=own.id;api("save2",serializer.Serialize(friends));
    friends=serializer.Deserialize<Friends>(api("read2",""));var ownArt=(Border)Call(rack,"FriendArt",friends.members[0],170d);Check(((Image)ownArt.Child).Source!=null&&friends.members[0].customDoll.opening.Length==3,"native custom template keeps its opening and renders its full saved composite");
    friends.members=new[]{new Friend{id="friend-a",name="好友 A",mode="doll",original=asset,result=asset,chasePhoto="",phrases=new[]{"快上班"},phraseMode="only"}};friends.currentId="friend-a";friends.displayedIds=new[]{"friend-a"};friends.enabled=true;friends.reminders=false;friends.autoChat=false;friends.interval=60;friends.motion="swing";friends.chaseSeconds=6;api("save2",serializer.Serialize(friends));Pump(100);
    var goodMetadata=api("read2","");var corruptAsset=Path.Combine(folder,"assets",Path.GetFileName(asset));File.WriteAllText(corruptAsset,"broken PNG");bool corruptRejected=false;try{api("save2",goodMetadata);}catch(TargetInvocationException){corruptRejected=true;}Check(corruptRejected&&api("read2","")==goodMetadata,"corrupt photo cannot replace committed metadata");
    var repaired=serializer.Deserialize<System.Collections.Generic.Dictionary<string,string>>(api("asset",data))["ref"];Check(repaired==asset&&File.ReadAllBytes(corruptAsset).Length>50,"reupload repairs same immutable photo reference");
    var committed=api("read2","");Directory.CreateDirectory(Path.Combine(folder,"companions-v2.json.tmp"));bool failed=false;try{api("save2",committed);}catch(TargetInvocationException){failed=true;}Directory.Delete(Path.Combine(folder,"companions-v2.json.tmp"));Check(failed&&api("read2","")==committed,"failed atomic save retains last successful member metadata");
    Call(rack,"Execute",serializer.Serialize(new{type="add",id="a",input=input}));Pump(150);
    var crew=(System.Collections.Generic.List<RackScene>)Field(rack,"crew");
    Check(Field(rack,"activePhase") as string=="near","five minutes begins near");Check(Field(rack,"chaseWindow")==null,"near never chases");
    Check((int)Field(crew[0],"alarm")==2,"near stays on hanging rig");
    Directory.CreateDirectory(args[1]);Shot(rack,Path.Combine(args[1],"native-near.png"));
    var root=(Canvas)Field(rack,"root");var rig=crew[0];var body=(FrameworkElement)Field(rig,"body");
    foreach(var motion in new[]{"swing","mirror","lash"}){
      rig.SetAlarm(2,motion,0);
      for(int frame=0;frame<100;frame++){rig.GetType().GetField("breezeTime",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(rig,frame*.037);Call(rig,"DrawBuddy");var bounds=body.TransformToAncestor(root).TransformBounds(new Rect(0,0,170,170));Check(bounds.Left>=0&&bounds.Right<=rack.Width&&bounds.Top>=0&&bounds.Bottom<=330,"hanging motion remains inside rack at "+motion+"/"+frame);}
    }
    foreach(double dpi in new[]{1.0,1.25,1.5,2.0,2.5})foreach(var physical in new[]{new Rect(-1920,0,1920,1040),new Rect(0,-1440,2560,1400),new Rect(0,0,1920,1040)}){
      var area=new Rect(physical.X/dpi,physical.Y/dpi,physical.Width/dpi,physical.Height/dpi);var extent=new Size(285,300);
      foreach(var pointer in new[]{area.TopLeft,area.BottomRight,new Point(area.Left+area.Width/2,area.Top+area.Height/2)}){var pos=DesktopPlacement.FollowTarget(pointer,area,extent);Check(area.Contains(new Rect(pos,extent)),"negative monitor / DPI / taskbar positioning");}
    }
    Rules.TestTime=due-1000;Call(rack,"Tick");Check(Field(rack,"chaseWindow")==null,"one second before due never chases");
    rig.GetType().GetField("bodyX",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(rig,140d);rig.GetType().GetField("bodyY",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(rig,100d);rig.GetType().GetField("pulling",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(rig,true);Call(rig,"DrawBuddy");Call(rig,"DrawBuddyOverlay");
    var foreground=GetForegroundWindow();Rules.TestTime=due;Call(rack,"Tick");Pump(150);Check(GetForegroundWindow()==foreground,"actual chase opening does not change foreground window");var chase=(Window)Field(rack,"chaseWindow");Check(chase!=null,"deadline starts photo chase");
    Check((int)Field(crew[0],"alarm")==0,"near animation cleared before chase");Check(Field(rig,"buddyOverlay")==null&&!(bool)Field(rig,"pulling"),"deadline clears suspended drag overlay and capture state before photo chase");Check(!(bool)Field(crew[0],"present")&&(double)Field(crew[0],"bodyX")==0,"rack duplicate is an inactive placeholder during pursuit");
    var panel=(StackPanel)chase.Content;
    Check(panel.Children.Count==2&&panel.Children[1] is Canvas,"full doll accompanies speech");
    var bubble=(Border)panel.Children[0];Check(((TextBlock)bubble.Child).Text=="快上班","dialogue only");
    var doll=(Canvas)panel.Children[1];Check(doll.Children.Count==2&&((Image)doll.Children[0]).Clip is EllipseGeometry,"portrait confined to face underneath template");
    var flip=(ScaleTransform)doll.RenderTransform;Check(flip.HasAnimatedProperties,"doll automatically mirrors");
    Check((GetExtendedStyle(new System.Windows.Interop.WindowInteropHelper(chase).Handle,-20)&0x08000020)==0x08000020&&!chase.Focusable,"whole follower passes clicks");
    Rules.TestTime=due+120000;Call(rack,"Tick");Check(Field(rack,"chaseWindow")==chase,"no duration or repeat timeout");
    Call(rack,"Execute",serializer.Serialize(new{type="add",id="other",input=new Todo{title="另一张",category="工作",color="blue",note="",dueAt=due+3600000}}));
    Call(rack,"Execute",serializer.Serialize(new{type="complete",id="other"}));Check((string)Field(rack,"activeCueId")=="a"&&Field(rack,"chaseWindow")!=null,"unrelated completion preserves pursuit");
    friends=serializer.Deserialize<Friends>(api("read2",""));
    friends.members=friends.members.Concat(new[]{new Friend{id="card",mode="photo",original=asset,result=asset,name="照片卡",dialogue=new Dialogue{chat=new[]{"你好呀"},near=new[]{"快到了"},overdue=new[]{"到点啦"},done=new[]{"收好【{任务名}】啦！"}}}}).ToArray();
    friends.currentId="card";api("save2",serializer.Serialize(friends));chase=(Window)Field(rack,"chaseWindow");
    panel=(StackPanel)chase.Content;var card=panel.Children[1] as Border;Check(card!=null&&card.Child is Image&&((ScaleTransform)card.RenderTransform).HasAnimatedProperties,"current photo card now mirrors");
    Check(((Image)card.Child).Stretch==Stretch.Uniform,"photo proportions preserved");
    rack.Hide();Call(rack,"Tick");Check(Field(rack,"chaseWindow")!=null,"hiding rack keeps pursuit");rack.Show();
    Rules.TestReducedMotion=true;Call(rack,"Tick");Check(Field(rack,"chaseWindow")==null&&(string)Field(rack,"activeCueId")=="a","reduced motion retains reminder on rack");
    Rules.TestReducedMotion=false;Call(rack,"Tick");Check(Field(rack,"chaseWindow")!=null,"motion resumes");
    Call(rack,"QuietToday");Check(Rules.Quiet(store.Read(),Rules.Now())&&Field(rack,"chaseWindow")==null,"quiet ends pursuit");
    Call(rack,"ToggleQuiet");Call(rack,"Tick");Check(Field(rack,"chaseWindow")!=null,"reminders resume");
    Call(rack,"Execute",serializer.Serialize(new{type="complete",id="a"}));Check(Field(rack,"chaseWindow")==null,"completion ends pursuit");var completedCrew=(System.Collections.Generic.List<RackScene>)Field(rack,"crew");var reply=(Border)Field(completedCrew[((System.Collections.Generic.List<string>)Field(rack,"crewIds")).IndexOf("card")],"bubble");Check(reply!=null&&((TextBlock)reply.Child).Text=="收好【报价单】啦！","native friend completion reply");Shot(rack,Path.Combine(args[1],"native-completion-reply.png"));
    var headPath=Path.Combine(Path.GetDirectoryName(args[0]),"fixtures","photos","head-cutout.png");var headData="data:image/png;base64,"+Convert.ToBase64String(File.ReadAllBytes(headPath));var headAsset=serializer.Deserialize<System.Collections.Generic.Dictionary<string,string>>(api("asset",headData))["ref"];
    friends=serializer.Deserialize<Friends>(api("read2",""));friends.members=new[]{new Friend{id="friend-a",name="好友 A",result=headAsset,original=headAsset,chasePhoto=headAsset},new Friend{id="boss-b",name="上司 B",template="rabbit",result=headAsset,original=headAsset,chasePhoto=headAsset},new Friend{id="buddy-c",name="搭子 C",template="pilot",result=headAsset,original=headAsset,chasePhoto=headAsset}};friends.currentId="friend-a";friends.displayedIds=friends.members.Select(m=>m.id).ToArray();api("save2",serializer.Serialize(friends));
    Call(rack,"ReorderFriend","buddy-c",-5);
    var sorted=serializer.Deserialize<Friends>(api("read2",""));
    Check(sorted.displayedIds.SequenceEqual(new[]{"friend-a","buddy-c","boss-b"}),"persisted rack order pins primary first");
    for(int i=0;i<10;i++)Call(rack,"Execute",serializer.Serialize(new{type="add",id="layout-"+i,input=new Todo{title="便签 "+(i+1),note="固定陪伴区域与横向浏览",category="工作",color="sage",dueAt=Rules.Now()+3600000}}));
    Check(((System.Collections.Generic.List<RackScene>)Field(rack,"crew")).Count==3,"three native companions visible");Check(((System.Collections.Generic.List<ClothBinding>)Field(rack,"bindings")).Count==10,"ten native tasks browse independently");Pump(50);Shot(rack,Path.Combine(args[1],"native-three-members-ten-tasks.png"));
    var idleFriends=serializer.Deserialize<Friends>(api("read2",""));idleFriends.members[0].dialogue.chat=new[]{"休息一下","一起加油"};
    idleFriends.autoChat=false;idleFriends.chatSeconds=15;api("save2",serializer.Serialize(idleFriends));
    var idleCrew=(System.Collections.Generic.List<RackScene>)Field(rack,"crew");
    Rules.TestTime=Rules.Now()+6000;double start=Rules.Now();Call(rack,"IdleChat",start+60000);
    Check(Field(idleCrew[0],"bubble")==null,"idle opt-out is honored");
    idleFriends=serializer.Deserialize<Friends>(api("read2",""));idleFriends.autoChat=true;api("save2",serializer.Serialize(idleFriends));
    idleCrew=(System.Collections.Generic.List<RackScene>)Field(rack,"crew");
    Check(Field(idleCrew[0],"bubble")!=null,"enabling proactive chat speaks on save without a click");idleCrew[0].ClearSpeech();
    Call(rack,"IdleChat",start+14999);
    Check(Field(idleCrew[0],"bubble")==null,"proactive chat waits the configured interval");
    Call(rack,"IdleChat",start+15000);var idleBubble=(Border)Field(idleCrew[0],"bubble");
    Check(idleBubble!=null&&idleFriends.members[0].dialogue.chat.Contains(((TextBlock)idleBubble.Child).Text),"proactive chat draws from saved pool at interval");
    var scene=(RackScene)Field(rack,"scene");scene.Slide(100);Pump(30);Shot(rack,Path.Combine(args[1],"native-last-task-page.png"));
    var many=serializer.Deserialize<Friends>(api("read2",""));
    many.members=many.members.Concat(Enumerable.Range(4,6).Select(i=>new Friend{id="more-"+i,name="搭子 "+i,mode="photo",original=asset,result=asset})).ToArray();
    many.displayedIds=many.members.Select(m=>m.id).ToArray();many.relief="both";api("save2",serializer.Serialize(many));
    var mounted=(System.Collections.Generic.List<RackScene>)Field(rack,"crew");
    Check(mounted.Count==9 && mounted.All(r=>(string)Field(r,"relief")=="both"),"all nine members mount with both gestures");
    Call(rack,"ReorderFriend","more-9",-1);var reordered=serializer.Deserialize<Friends>(api("read2",""));Check(reordered.displayedIds.Length==9&&reordered.displayedIds[7]=="more-9","ninth member can be reordered");
    var preview=new Canvas{Width=800,Height=520,Background=Brushes.WhiteSmoke};int at=0;foreach(var style in new[]{"varsity","rabbit","dino","sheriff","pilot","mouse","rice","receipt"}){var art=(FrameworkElement)Call(rack,"FriendArt",new Friend{template=style,result=headAsset},170d);Canvas.SetLeft(art,20+(at%4)*195);Canvas.SetTop(art,18+(at/4)*250);preview.Children.Add(art);var label=new TextBlock{Text=style,Width=170,TextAlignment=TextAlignment.Center,FontSize=14,Foreground=Brushes.SlateGray};Canvas.SetLeft(label,20+(at%4)*195);Canvas.SetTop(label,198+(at/4)*250);preview.Children.Add(label);at++;}
    var previewWindow=new Window{Content=preview,Width=800,Height=520,WindowStyle=WindowStyle.None,ShowActivated=false,ShowInTaskbar=false,Left=-9000,Top=-9000};previewWindow.Show();Pump(50);Shot(previewWindow,Path.Combine(args[1],"native-eight-body-templates.png"));previewWindow.Close();
    var source=PresentationSource.FromVisual(rack);File.WriteAllText(Path.Combine(args[1],"native-environment.json"),serializer.Serialize(new{screens=System.Windows.Forms.Screen.AllScreens.Select(screen=>new{device=screen.DeviceName,primary=screen.Primary,x=screen.Bounds.X,y=screen.Bounds.Y,width=screen.Bounds.Width,height=screen.Bounds.Height,workHeight=screen.WorkingArea.Height}).ToArray(),dpiScaleX=source.CompositionTarget.TransformToDevice.M11,dpiScaleY=source.CompositionTarget.TransformToDevice.M22,simulatedScales=new[]{1.0,1.25,1.5,2.0,2.5},foregroundPreserved=true}));
    Rules.TestReducedMotion=null;
    Console.WriteLine("PASS: shared clock boundaries, near hanging animation, deadline transition, mirrored current doll and photo card, persistent pursuit, click-through speech, quiet and completion, motion bounds, simulated DPI/negative work areas, live reduced motion, today quiet, completion reply and three members/ten tasks");rack.Exit();return 0;
  }catch(Exception e){Console.Error.WriteLine(e);if(rack!=null)rack.Exit();return 1;}}
}
