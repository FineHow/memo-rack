using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using Path = System.Windows.Shapes.Path;

namespace Clothesline {
  public sealed partial class RackScene : Canvas {
    const double PaperWidth = 150, Space = 176, RailTop = 48;
    readonly List<StackPanel> cards = new List<StackPanel>();
    bool still;
    readonly Action<string> select;
    readonly int count;
    readonly DispatcherTimer timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
    readonly Stopwatch clock = Stopwatch.StartNew();
    Point down, last;
    double lastTime, lastFrame, gust, angle, speed;
    bool dragged;
    string pressed;
    public double Offset { get; private set; }
    public RackScene(double width, int total, double offset, bool reduce, Action<string> onSelect, Action<string> onComplete) {
      Width=width; count=total; still=reduce; select=onSelect; complete=onComplete; ClipToBounds=true;
      Offset=offset;
      var dragBand=new Border{Width=width-32,Height=61,Background=RackWindow.BrushOf("#01000000"),Cursor=Cursors.ScrollWE};
      SetLeft(dragBand,16);SetTop(dragBand,RailTop);Children.Add(dragBand);
      var bar=new Border { Width=width-32, Height=11, Background=RackWindow.Surface("chrome"), CornerRadius=new CornerRadius(3), Cursor=Cursors.Hand };
      SetLeft(bar,16); SetTop(bar,RailTop); SetZIndex(bar,1); Children.Add(bar);
      timer.Tick+=delegate { Advance(); }; Unloaded+=delegate { timer.Stop(); CloseFloatingPaper();CloseBuddyOverlay(); };
      IsVisibleChanged+=delegate{if(!IsVisible){CancelInteraction();}else if(!still && body!=null)StartSpring();};
      LostMouseCapture+=delegate(object sender,MouseEventArgs e) { if(e.OriginalSource==this && gesture!=Gesture.Finish)ResetPaper(); };
    }
    public void CancelInteraction(){
      timer.Stop();if(puppet!=null&&puppet.IsMouseCaptured)puppet.ReleaseMouseCapture();if(IsMouseCaptured)ReleaseMouseCapture();ResetPaper();CloseFloatingPaper();CloseBuddyOverlay();pulling=false;flightTime=windupTime=outsideTime=smackTime=spin=impactTime=0;detached=false;bodyX=bodyY=velocityX=velocityY=headAngle=headSpeed=0;if(body!=null)DrawBuddy();timer.Stop();
    }
    public void SetReducedMotion(bool value){
      if(still==value)return;still=value;
      if(still){CancelInteraction();gust=angle=speed=0;foreach(var card in cards)if(card.RenderTransform is TransformGroup){var group=(TransformGroup)card.RenderTransform;((SkewTransform)group.Children[1]).AngleY=0;((RotateTransform)group.Children[2]).Angle=0;var scale=(ScaleTransform)group.Children[0];scale.ScaleX=scale.ScaleY;}}
      else if(IsVisible&&body!=null)StartSpring();
    }
    readonly List<RackScene> memberRigs=new List<RackScene>();
    readonly Dictionary<StackPanel,FrameworkElement> hookBacks=new Dictionary<StackPanel,FrameworkElement>();
    double MemberSpan {get{return Space*memberRigs.Count;}}
    double ContentSpan {get{return MemberSpan+Space*count;}}
    double ClampOffset(double pos){return Math.Max(0,Math.Min(pos,ContentSpan-(Width-40)));}
    public bool DeferLayout {private get;set;}
    public void ScrollTo(double offset){Offset=ClampOffset(offset);ArrangeCards();}
    public void Slide(double slots){ScrollTo(Offset+slots*Space);}
    public void Reveal(FrameworkElement item,double width){
      double left=GetLeft(item),delta=left<14?left-14:Math.Max(0,left+width+14-Width);
      if(delta!=0){Offset=ClampOffset(Offset+delta);ArrangeCards();}
    }
    void ArrangeCards(){
      if(DeferLayout)return;
      if(memberSlot){foreach(var card in cards)SetLeft(card,0);return;}
      Offset=ClampOffset(Offset);
      double origin=Math.Max(20,(Width-ContentSpan)/2)-Offset;
      double left=origin;
      foreach(var rig in memberRigs){
        double slot=Space;
        SetLeft(rig,left+(slot-PaperWidth)/2);
        SetTop(rig,0);
        left+=slot;
      }
      for(int i=0;i<cards.Count;i++){
        var card=cards[i];
        double x=origin+MemberSpan+(Space-PaperWidth)/2+i*Space;
        SetLeft(card,x);
        FrameworkElement back;
        if(hookBacks.TryGetValue(card,out back))SetLeft(back,x);
      }
      if(guestRig!=null&&memberRigs.Count>0)SetLeft(guestRig,GetLeft(memberRigs[0]));
    }
    static void Wire(Panel layer,string shape,double width){
      var contour=Geometry.Parse(shape);
      foreach(var stroke in new[]{RackWindow.BrushOf("#414650"),RackWindow.BrushOf("#DCE0E3")}){
        layer.Children.Add(new Path{Data=contour,Stroke=stroke,StrokeThickness=layer.Children.Count%2==0?width+1.5:width,
          StrokeStartLineCap=PenLineCap.Round,StrokeEndLineCap=PenLineCap.Round,StrokeLineJoin=PenLineJoin.Round,IsHitTestVisible=false});
      }
    }
    public void HangCompanion(FrameworkElement buddy,double size,double[] anchors,Func<string> nextTask) {
      RigBuddy(buddy,size,anchors,nextTask);
    }
    public void Hang(string id, FrameworkElement sheet) {
      var card=new StackPanel { Width=PaperWidth, Tag=id, Cursor=Cursors.Hand, RenderTransformOrigin=new Point(.5,0), RenderTransform=new TransformGroup{Children={new ScaleTransform(),new SkewTransform(),new RotateTransform()}} };
      var wire=new Grid{Width=PaperWidth,Height=58,Background=Brushes.Transparent,Tag="hanger",Cursor=Cursors.ScrollWE};
      var back=new Canvas{Width=PaperWidth,Height=58,IsHitTestVisible=false,RenderTransform=card.RenderTransform,RenderTransformOrigin=card.RenderTransformOrigin};
      Wire(back,"M65,12 C64,7 68,1 75,1",1.9);
      Wire(wire,"M75,1 C86,1 88,13 81,19 L75,23 L75,29 M75,29 L4,54 Q2,56 5,56 H145 Q148,56 145,54 Z",1.9);
      hookBacks.Add(card,back);Children.Add(back);SetTop(back,RailTop-5);SetZIndex(back,0);
      sheet.Effect=new System.Windows.Media.Effects.DropShadowEffect{Color=Color.FromRgb(50,55,65),BlurRadius=3,ShadowDepth=1,Opacity=.13};
      sheet.RenderTransformOrigin=new Point(.5,.05); sheet.RenderTransform=PaperTransform();
      sheet.MouseEnter+=delegate {Hover(sheet,true);};sheet.MouseLeave+=delegate {Hover(sheet,false);};
      card.Children.Add(wire); card.Children.Add(sheet);
      cards.Add(card); Children.Add(card); SetTop(card,RailTop-5); SetZIndex(card,3);
      ArrangeCards();
    }
    protected override void OnMouseLeftButtonDown(MouseButtonEventArgs e){
      BeginPointer(e.GetPosition(this), e.OriginalSource as DependencyObject);
      e.Handled=true;
    }
    private void BeginPointer(Point position, DependencyObject el){
      if(returningPaper)ResetPaper();
      if(gesture==Gesture.Finish)return;
      down=last=position; lastTime=clock.Elapsed.TotalSeconds; dragged=false; pressed=null;
      while(el!=null && el!=this) {
        var wire=el as Grid;if(wire!=null && Equals(wire.Tag,"hanger"))break;
        var panel=el as StackPanel;
        if(panel!=null && panel.Tag is string){pressed=(string)panel.Tag; selectedCard=panel; selectedSheet=(FrameworkElement)panel.Children[1];
          break;}
        el=VisualTreeHelper.GetParent(el);
      }
      CaptureMouse();
    }
    protected override void OnMouseMove(MouseEventArgs e){
      if(!IsMouseCaptured || e.LeftButton!=MouseButtonState.Pressed) return;
      MovePointer(e.GetPosition(this)); e.Handled=true;
    }
    private void MovePointer(Point p){
      if(!dragged && (p-down).Length<5) return;
      dragged=true;
      if(selectedSheet!=null){MoveSheet(p);return;}
      double dx=p.X-last.X, now=clock.Elapsed.TotalSeconds;
      Offset=ClampOffset(Offset-dx); ArrangeCards();
      if(!still) {
        gust=Math.Max(-5,Math.Min(5,dx/Math.Max(.008,now-lastTime)/180));
        if(!timer.IsEnabled){lastFrame=now;timer.Start();}
      }
      last=p;lastTime=now;
    }
    protected override void OnMouseLeftButtonUp(MouseButtonEventArgs e){
      if(!IsMouseCaptured)return;
      EndPointer(e.GetPosition(this));e.Handled=true;
    }
    private void EndPointer(Point p){
      if(selectedSheet!=null && dragged){FinishSheet(p);return;}
      string id=dragged?null:pressed;ReleaseMouseCapture();ResetPaper();
      if(id!=null)select(id);
    }
    string focused;
    public void FocusMemo(string id){
      if(focused==id)return;focused=id;
      foreach(var card in cards){if(card.Tag==null)continue;bool active=Equals(card.Tag,id);double size=active?1.10:1;
        var scale=(ScaleTransform)((TransformGroup)card.RenderTransform).Children[0];
        scale.ScaleX=scale.ScaleY=size;SetZIndex(card,active?5:3);
      }
    }
    void Advance(){
      double now=clock.Elapsed.TotalSeconds,dt=Math.Min(.032,now-lastFrame);lastFrame=now;
      bool springActive=StepBuddy(dt);
      speed+=(gust*240-38*angle-5.6*speed)*dt;angle+=speed*dt;gust*=Math.Exp(-11*dt);
      if(Math.Abs(gust)+Math.Abs(speed)+Math.Abs(angle)<.05){angle=speed=gust=0;if(!springActive)timer.Stop();}
      for(int i=0;i<cards.Count;i++) {
        var card=cards[i];if(card.Tag==null)continue;
        var surface=(TransformGroup)card.RenderTransform;double sway=card==selectedCard?0:Math.Max(-19,Math.Min(19,angle*(1+.05*(i%3))));
        ((SkewTransform)surface.Children[1]).AngleY=sway*.42;
        ((RotateTransform)surface.Children[2]).Angle=sway;
        var scale=(ScaleTransform)surface.Children[0];scale.ScaleX=scale.ScaleY*Math.Cos(sway*.018);
      }
    }
  }
}
