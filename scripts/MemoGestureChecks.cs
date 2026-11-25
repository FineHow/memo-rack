using System;
using System.Reflection;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Threading;
using Clothesline;

// Exercise the native input state machine in an isolated WPF window with its normal render clock.
class MemoGestureChecks {
  static object Call(object instance,string method,params object[] arguments){
    return instance.GetType().GetMethod(method,BindingFlags.Instance|BindingFlags.NonPublic).Invoke(instance,arguments);
  }
  static object Field(object obj,string name){return obj.GetType().GetField(name,BindingFlags.NonPublic|BindingFlags.Instance).GetValue(obj);}
  static void Set(object obj,string field,object value){obj.GetType().GetField(field,BindingFlags.NonPublic|BindingFlags.Instance).SetValue(obj,value);}
  static void Check(bool ok,string name){if(!ok) throw new Exception(name);}
  static void Wait(int ms){
    var frame=new DispatcherFrame();
    var timer=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(ms)};
    timer.Tick+=delegate{timer.Stop();frame.Continue=false;};timer.Start();Dispatcher.PushFrame(frame);
  }
  [STAThread] public static int Main(){try {Run();return 0;}catch(Exception e){Console.Error.WriteLine(e);return 1;}}
  static void Run(){
    int opened=0,completed=0;
    var scene=new RackScene(640,1,0,false,id=>opened++,id=>completed++){Height=310};
    var paper=new Border{Width=150,Height=187.5,Background=Brushes.SkyBlue};
    paper.Child=new TextBlock{Text="Whole sheet",Margin=new Thickness(12),Foreground=Brushes.DarkBlue};
    scene.Hang("memo",paper);
    var w=new Window{Left=-9000,Top=-9000,Width=640,Height=330,ShowActivated=false,ShowInTaskbar=false,Content=scene};
    w.Show();w.UpdateLayout();Wait(60);
    var added=scene.AddMember(new Border{Background=Brushes.Linen,Width=170,Height=170},new[]{.3,.7,.2},true,()=>"你好呀");
    w.UpdateLayout();
    var buddyBody=(FrameworkElement)Field(added,"body");
    var hit=scene.InputHitTest(buddyBody.TranslatePoint(new Point(75,80),scene));
    Check(hit==buddyBody && buddyBody.Cursor==System.Windows.Input.Cursors.Hand,"visible portrait receives drag hit and hand cursor");
    var wireCard=(StackPanel)paper.Parent;
    var backs=(System.Collections.Generic.Dictionary<StackPanel,FrameworkElement>)Field(scene,"hookBacks");
    var rail=(Border)scene.Children[1];
    Check(Canvas.GetZIndex(backs[wireCard])<Canvas.GetZIndex(rail)&&Canvas.GetZIndex(rail)<Canvas.GetZIndex(wireCard),"rail occludes hook back under front wire");
    Check(wireCard.Clip==null,"no companion divider masks the raised paper");
    scene.RemoveMember(added);w.UpdateLayout();
    var center=paper.TranslatePoint(new Point(75,94),scene);
    Action press=()=>Call(scene,"BeginPointer",center,paper);
    Action<double,double> move=(x,y)=>Call(scene,"MovePointer",new Point(center.X+x,center.Y+y));
    Action<double,double> release=(x,y)=>Call(scene,"EndPointer",new Point(center.X+x,center.Y+y));
    Call(scene,"Hover",paper,true);Wait(190);Check(paper.RenderTransform.Value.M11>1,"hover lift");
    press();release(0,0);Check(opened==1 && completed==0,"single click opens detail");
    press();move(22,8);release(22,8);Check((bool)Field(scene,"returningPaper"),"on-rack release springs back");Wait(500);Check(completed==0 && paper.Opacity==1,"on-rack drag cancels");
    press();Wait(460);move(0,70);
    var pop=(System.Windows.Controls.Primitives.Popup)scene.GetType().GetField("floatingPaper",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(scene);
    Check(pop.IsOpen && paper.Clip==null,"long hold moves complete sheet");
    var copy=(Border)((Border)pop.Child).Child;
    Wait(80);
    var viewport=copy.Child as Viewport3D;Check(viewport!=null,"detached sheet uses perspective");
    var seen=new System.Windows.Media.Imaging.RenderTargetBitmap(150,188,96,96,PixelFormats.Pbgra32);
    var sheetVisual=new DrawingVisual();using(var ctx=sheetVisual.RenderOpen()){ctx.DrawRectangle(new VisualBrush(copy),null,new Rect(0,0,150,188));}seen.Render(sheetVisual);
    var visible=new byte[150*188*4];seen.CopyPixels(visible,150*4,0);
    Check(visible[(94*150+75)*4+3]>200,"3D sheet visibly painted");
    var pixels=(System.Windows.Media.Imaging.BitmapSource)((ImageBrush)copy.Background).ImageSource;
    var buffer=new byte[pixels.PixelWidth*pixels.PixelHeight*4];pixels.CopyPixels(buffer,pixels.PixelWidth*4,0);
    foreach(int row in new[]{2,pixels.PixelHeight/2,pixels.PixelHeight-3})
      foreach(int col in new[]{2,pixels.PixelWidth-3})Check(buffer[(row*pixels.PixelWidth+col)*4+3]>230,"opaque corners of full floating sheet");
    release(0,70);Check(completed==0,"long hold never tears");
    press();move(-14,170);var flight=(System.Windows.Controls.Primitives.Popup)Field(scene,"floatingPaper");release(-14,170);Wait(580);Check(completed==0 && flight.IsOpen,"finish waits for flight");Wait(720);Check(completed==1 && opened==1,"throw outside completes once");
    press();move(15,9);var centerField=scene.GetType().GetField("binCenter",BindingFlags.NonPublic|BindingFlags.Instance);
    Point bin=(Point)centerField.GetValue(scene);Call(scene,"EndPointer",bin);Wait(1310);Check(completed==2,"drop in basket");
    var card=(StackPanel)paper.Parent;var tx=(TransformGroup)card.RenderTransform;double naturalAngle=((RotateTransform)tx.Children[2]).Angle;scene.FocusMemo("memo");
    Check(((ScaleTransform)tx.Children[0]).ScaleY>1 && Math.Abs(((RotateTransform)tx.Children[2]).Angle-naturalAngle)<.001,"deadline enlarges without shaking");
    scene.FocusMemo(null);Call(scene,"BeginPointer",center,card.Children[0]);move(90,0);Wait(80);
    Check(Math.Abs(((SkewTransform)tx.Children[1]).AngleY)>.01 && Field(scene,"floatingPaper")==null,"hanger drag tilts without detaching");
    release(90,0);
    var buddy=new Canvas{Width=198,Height=198,Background=Brushes.Orange};
    scene.HangCompanion(buddy,198,new[]{.3,.7,.29},()=>"next task");
    Wait(250);Check(Math.Abs((double)Field(scene,"bodyX"))>.01,"companion breeze");
    w.Left=SystemParameters.WorkArea.Right-500;w.Top=SystemParameters.WorkArea.Top+20;w.Opacity=0;w.UpdateLayout();
    scene.GetType().GetField("bodyX",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(scene,900d);
    scene.GetType().GetField("bodyY",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(scene,240d);
    Call(scene,"DrawBuddy");Call(scene,"DrawBuddyOverlay");
    var overlay=(System.Windows.Interop.HwndSource)Field(scene,"buddyOverlay");
    var mirror=(Canvas)Field(scene,"mirror");((FrameworkElement)overlay.RootVisual).UpdateLayout();
    var extended=((System.Windows.Shapes.Line[])Field(scene,"extendedCords"))[0];
    var actual=mirror.PointToScreen(new Point(extended.X1,extended.Y1));
    var cord=(System.Windows.Shapes.Line)Field(scene,"leftCord");
    var expected=((Canvas)Field(scene,"puppet")).PointToScreen(new Point(cord.X1,cord.Y1));
    Check((actual-expected).Length<=2 && mirror.Height>350,"stretched foreground rope starts at actual screen hook near monitor edge");
    for(int i=0;i<45 && Field(scene,"buddyOverlay")!=null;i++)Wait(100);
    Check(Field(scene,"buddyOverlay")==null,"companion lands and releases overlay");
    Set(scene,"bodyX",-230d);Set(scene,"bodyY",240d);
    Check(!(bool)Call(scene,"LaunchBuddy"),"optional sling defaults off");
    Set(scene,"relief","sling");Call(scene,"DrawBuddy");Call(scene,"DrawBuddyOverlay");
    var fixedCord=(System.Windows.Shapes.Line)Field(scene,"leftCord");
    var pivot=new Point(fixedCord.X1,fixedCord.Y1);
    Check(((Canvas)Field(scene,"puppet")).Opacity==1,"hooks stay on rail during long pull");
    Check((bool)Call(scene,"LaunchBuddy") && (double)Field(scene,"velocityX")>0 && (double)Field(scene,"velocityY")<0,"down-left pull launches up-right");
    Call(scene,"StepBuddy",.032);Check(!(bool)Field(scene,"detached") && Math.Abs((double)Field(scene,"spin"))>0,"shake before launch");
    for(int i=0;i<10;i++)Call(scene,"StepBuddy",.016);
    Check((bool)Field(scene,"detached") && fixedCord.Opacity==1 && fixedCord.X1==pivot.X && fixedCord.Y1==pivot.Y,"flight separates art from fixed rope");
    while((double)Field(scene,"flightTime")>0)Call(scene,"StepBuddy",.016);
    var original=(FrameworkElement)Field(scene,"body");var corners=original.TransformToAncestor(w).TransformBounds(new Rect(0,0,198,198));
    var flightBounds=new Rect(w.PointToScreen(corners.TopLeft),w.PointToScreen(corners.BottomRight));
    var desktop=new Rect(SystemParameters.VirtualScreenLeft,SystemParameters.VirtualScreenTop,SystemParameters.VirtualScreenWidth,SystemParameters.VirtualScreenHeight);
    var toDip=PresentationSource.FromVisual(w).CompositionTarget.TransformFromDevice;flightBounds.Transform(toDip);
    Check(!desktop.IntersectsWith(flightBounds),"entire buddy clears desktop edge");
    for(int i=0;i<300;i++)Call(scene,"StepBuddy",.016);
    Check(!(bool)Field(scene,"detached") && Field(scene,"buddyOverlay")==null && Math.Abs((double)Field(scene,"bodyY"))<1,"flight returns to original slot");
    Set(scene,"bodyX",-220d);Set(scene,"bodyY",100d);Call(scene,"DrawBuddy");Call(scene,"DrawBuddyOverlay");
    scene.SetPresence(false);Check(Field(scene,"buddyOverlay")==null,"starting pursuit retires the stretched cords immediately");
    scene.SetPresence(true);
    var speaker=scene.AddMember(new Canvas{Width=198,Height=198,Background=Brushes.Blue},new[]{.3,.7,.29},true,()=>"test");
    var silent=scene.AddMember(new Canvas{Width=198,Height=198,Background=Brushes.Red},new[]{.3,.7,.29},false,()=>"test");
    speaker.Say("deadline");silent.Say("deadline");Check(Field(silent,"bubble")!=null && Field(speaker,"bubble")!=null,"visible member click always responds");
    speaker.SetAlarm(2,"swing",0);silent.SetAlarm(2,"mirror",1);Wait(160);
    var spinning=(FrameworkElement)Field(speaker,"body");var swingCord=(System.Windows.Shapes.Line)Field(speaker,"leftCord");
    double ropeLength=Math.Sqrt(Math.Pow(swingCord.X2-swingCord.X1,2)+Math.Pow(swingCord.Y2-swingCord.Y1,2));
    Check(Math.Abs(swingCord.X2-swingCord.X1)>1 && Math.Abs(ropeLength-(65.5+170*.29-8))<4,"reminder swings around fixed hook at constant cord length");
    speaker.SetAlarm(3,"lash",0);Wait(180);Check(Field(speaker,"buddyOverlay")==null,"suspended components never pursue mouse");
    speaker.SetAlarm(0,"lash",0);
    w.Close();Console.WriteLine("PASS: hover, detail, cancelled drag, whole-sheet pixels, long hold, outside throw, basket drop, deadline focus and hanger tilt.");
  }
}
