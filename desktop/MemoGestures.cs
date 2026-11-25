using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Media.Media3D;
using System.Windows.Threading;
using System.Windows.Shapes;

namespace Clothesline {
  public sealed partial class RackScene {
    enum Gesture { Pending, Drag, Finish }
    Gesture gesture;
    FrameworkElement selectedSheet;
    StackPanel selectedCard;
    Canvas bin;
    Popup floatingPaper;
    Point grabOffset;
    bool returningPaper;
    DispatcherTimer returnFlight;
    void CloseFloatingPaper() {
      if(returnFlight!=null){returnFlight.Stop();returnFlight=null;}
      if(floatingPaper!=null){floatingPaper.IsOpen=false;floatingPaper.Child=null;floatingPaper=null;}
    }
    Point ScreenDip(Point p) {
      var source=PresentationSource.FromVisual(this);
      return source.CompositionTarget.TransformFromDevice.Transform(PointToScreen(p));
    }
    void FloatPaper(Point p) {
      Point pointer=ScreenDip(p);
      if(floatingPaper==null){
        var origin=ScreenDip(selectedSheet.TranslatePoint(new Point(0,0),this));
        var grab=ScreenDip(down);grabOffset=new Point(grab.X-origin.X,grab.Y-origin.Y);
        double factor=ScreenDip(new Point(100,0)).X-ScreenDip(new Point(0,0)).X;
        var bounds=selectedSheet.TransformToAncestor(this).TransformBounds(new Rect(0,0,selectedSheet.ActualWidth,selectedSheet.ActualHeight));
        var copy=new Border{Width=bounds.Width*factor/100,Height=bounds.Height*factor/100,
          Background=new ImageBrush(Snapshot(selectedSheet)),IsHitTestVisible=false};
        floatingPaper=new Popup{Placement=PlacementMode.AbsolutePoint,AllowsTransparency=true,
          StaysOpen=true,Focusable=false,IsHitTestVisible=false,Child=new Border{Padding=new Thickness(32),Child=copy}};
        if(!still){
          copy.Effect=new System.Windows.Media.Effects.DropShadowEffect{BlurRadius=10,ShadowDepth=4,Opacity=.24};
          MakePaperMesh(copy);
        }
        selectedSheet.Opacity=0;
      }
      floatingPaper.HorizontalOffset=pointer.X-grabOffset.X-32;
      floatingPaper.VerticalOffset=pointer.Y-grabOffset.Y-32;
      floatingPaper.IsOpen=true;
    }
    AxisAngleRotation3D paperYaw,paperPitch;
    void MakePaperMesh(Border copy){
      var brush=(ImageBrush)copy.Background;
      var mesh=new MeshGeometry3D{
        Positions=new Point3DCollection{new Point3D(-1,1.25,0),new Point3D(-1,-1.25,0),new Point3D(1,-1.25,0),new Point3D(1,1.25,0)},
        TextureCoordinates=new PointCollection{new Point(0,0),new Point(0,1),new Point(1,1),new Point(1,0)},
        TriangleIndices=new Int32Collection{0,1,2,0,2,3}};
      var material=new DiffuseMaterial(brush.Clone());
      var model=new GeometryModel3D(mesh,material){BackMaterial=material};
      paperYaw=new AxisAngleRotation3D(new Vector3D(0,1,0),0);paperPitch=new AxisAngleRotation3D(new Vector3D(1,0,0),0);
      var tilt=new Transform3DGroup();tilt.Children.Add(new RotateTransform3D(paperYaw));tilt.Children.Add(new RotateTransform3D(paperPitch));model.Transform=tilt;
      var group=new Model3DGroup();group.Children.Add(new AmbientLight(Colors.White));group.Children.Add(model);
      // Leave headroom around the 3-D page so its near corners stay inside the viewport at full tilt.
      var view=new Viewport3D{Margin=new Thickness(-copy.Width*.16,-copy.Height*.16,-copy.Width*.16,-copy.Height*.16),ClipToBounds=false,IsHitTestVisible=false,Camera=new PerspectiveCamera(new Point3D(0,0,6.6),new Vector3D(0,0,-1),new Vector3D(0,1,0),22.62)};
      view.Children.Add(new ModelVisual3D{Content=group});copy.Child=view;
      brush.Opacity=0;
    }
    void ThrowToBasket(string id) {
      var copy=(Border)((Border)floatingPaper.Child).Child;
      var target=ScreenDip(binCenter);
      double w=copy.Width,h=copy.Height;
      var start=new Point(floatingPaper.HorizontalOffset+32+w/2,floatingPaper.VerticalOffset+32+h/2);
      var folds=new Path{Stretch=Stretch.Fill,Data=Geometry.Parse("M0,15 L45,67 85,2 M45,67 L24,154 89,109 145,168 M45,67 L89,109 146,75"),Stroke=RackWindow.BrushOf("#80545C75"),StrokeThickness=1.7};
      ((ImageBrush)copy.Background).Opacity=1;folds.Opacity=0;
      var crease=new LinearGradientBrush{StartPoint=new Point(0,0),EndPoint=new Point(0,1)};
      crease.GradientStops.Add(new GradientStop(Color.FromArgb(35,24,34,58),0));crease.GradientStops.Add(new GradientStop(Color.FromArgb(220,255,253,238),.42));crease.GradientStops.Add(new GradientStop(Color.FromArgb(168,77,80,98),1));
      var curl=new Border{Background=crease,VerticalAlignment=VerticalAlignment.Bottom,CornerRadius=new CornerRadius(4),Height=0};
      var foldedPaper=new Grid();foldedPaper.Children.Add(folds);foldedPaper.Children.Add(curl);copy.Child=foldedPaper;
      var watch=System.Diagnostics.Stopwatch.StartNew();
      returnFlight=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(16)};
      returnFlight.Tick+=delegate {
        double t=Math.Min(1,watch.Elapsed.TotalMilliseconds/(still?240:1160));
        double roll=Math.Min(1,t/.42),f=roll*roll*(3-2*roll);
        double u=Math.Max(0,(t-.20)/.80),flight=u*u*(3-2*u);
        double x=start.X+(target.X-start.X)*flight,y=start.Y+(target.Y-start.Y)*flight-(still?0:65)*Math.Sin(u*Math.PI);
        copy.Width=w*(1-.74*f-.16*flight);copy.Height=h*(1-.81*f-.11*flight);copy.CornerRadius=new CornerRadius(28*f);
        curl.Height=copy.Height*.34*f;folds.Opacity=f;copy.Opacity=Math.Min(1,(1-t)*12);
        copy.RenderTransformOrigin=new Point(.5,.5);copy.RenderTransform=new RotateTransform(still?0:48*f+258*flight);
        floatingPaper.HorizontalOffset=x-copy.Width/2-32;floatingPaper.VerticalOffset=y-copy.Height/2-32;
        if(t>=1){ResetPaper();complete(id);}
      };
      returnFlight.Start();
    }
    Point binCenter;
    readonly Action<string> complete;
    static readonly Duration Quick = new Duration(TimeSpan.FromMilliseconds(140));
    static void Tween(Animatable target, DependencyProperty property, double value, Duration duration) {
      target.BeginAnimation(property, new DoubleAnimation(value, duration) { EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseOut } });
    }
    // Paint the paper in its own coordinate system. Its arranged offset, rack clip and
    // parent tilt must not become part of the detached drag image.
    static void DrawContents(DrawingContext dc,Visual visual){
      var drawing=VisualTreeHelper.GetDrawing(visual);
      if(drawing!=null)dc.DrawDrawing(drawing);
      for(int i=0;i<VisualTreeHelper.GetChildrenCount(visual);i++){
        var child=VisualTreeHelper.GetChild(visual,i) as Visual;
        if(child==null)continue;
        var offset=VisualTreeHelper.GetOffset(child);
        dc.PushTransform(new TranslateTransform(offset.X,offset.Y));
        dc.PushTransform(VisualTreeHelper.GetTransform(child)??Transform.Identity);
        dc.PushOpacity(VisualTreeHelper.GetOpacity(child));
        dc.PushClip(VisualTreeHelper.GetClip(child));
        DrawContents(dc,child);
        dc.Pop();dc.Pop();dc.Pop();dc.Pop();
      }
    }
    static BitmapSource Snapshot(FrameworkElement sheet) {
      var visual=new DrawingVisual();
      using(var dc=visual.RenderOpen()){DrawContents(dc,sheet);}
      const double factor=2;
      var bitmap=new RenderTargetBitmap((int)Math.Ceiling(sheet.ActualWidth*factor),(int)Math.Ceiling(sheet.ActualHeight*factor),96*factor,96*factor,PixelFormats.Pbgra32);
      bitmap.Render(visual);bitmap.Freeze();return bitmap;
    }
    void Hover(FrameworkElement sheet, bool enter) {
      if(still || selectedSheet == sheet) return;
      var card=sheet.Parent as StackPanel;
      if(card!=null){
        if(enter&&Mouse.Captured==null)Reveal(card,PaperWidth);
        SetZIndex(card,enter?9:Equals(focused,card.Tag)?5:3);
      }
      var group = (TransformGroup)sheet.RenderTransform;
      var shade=sheet.Effect as System.Windows.Media.Effects.DropShadowEffect;
      if(shade!=null){
        Tween(shade,System.Windows.Media.Effects.DropShadowEffect.ShadowDepthProperty,enter?6:1,Quick);
        Tween(shade,System.Windows.Media.Effects.DropShadowEffect.OpacityProperty,enter?.27:.13,Quick);
      }
      Tween(group.Children[2], SkewTransform.AngleXProperty,enter ? -3.5 : 0,Quick);
      Tween(group.Children[0], ScaleTransform.ScaleXProperty, enter ? 1.065 : 1, Quick);
      Tween(group.Children[0], ScaleTransform.ScaleYProperty, enter ? 1.065 : 1, Quick);
      Tween(group.Children[1], TranslateTransform.YProperty, enter ? -8 : 0, Quick);
    }
    void ResetPaper() {
      returningPaper=false;CloseFloatingPaper();
      if(selectedSheet != null) {
        var shade=selectedSheet.Effect as System.Windows.Media.Effects.DropShadowEffect;if(shade!=null){shade.BeginAnimation(System.Windows.Media.Effects.DropShadowEffect.OpacityProperty,null);shade.BeginAnimation(System.Windows.Media.Effects.DropShadowEffect.ShadowDepthProperty,null);}
        selectedSheet.Clip = null;
        selectedSheet.RenderTransform = PaperTransform();
        selectedSheet.Opacity = 1;
        SetZIndex(selectedCard,Equals(focused,selectedCard.Tag)?5:3);
      }
      if(bin != null) Children.Remove(bin);

      bin=null; selectedSheet=null; selectedCard=null;
      pressed=null; dragged=false; gesture=Gesture.Pending;
    }
    static TransformGroup PaperTransform() {
      var group=new TransformGroup();
      group.Children.Add(new ScaleTransform(1,1)); group.Children.Add(new TranslateTransform());group.Children.Add(new SkewTransform());
      return group;
    }
    void ShowBin() {
      double x = GetLeft(selectedCard)+PaperWidth/2;
      binCenter = new Point(Math.Max(34,Math.Min(Width-34,x+(x>Width/2?-116:116))),Height-39);
      bin=new Canvas {Width=56,Height=56,IsHitTestVisible=false};
      bin.Children.Add(new Ellipse { Width=56,Height=56,Fill=RackWindow.BrushOf("#F5FAFAFC"),Stroke=RackWindow.BrushOf("#D1D6E0") });
      var basket=new Path {Data=Geometry.Parse("M13,18 Q28,12 43,18 L38,42 Q28,47 18,42 Z M13,18 Q28,23 43,18 M21,24 L23,39 M28,25 L28,40 M35,24 L33,39"),Stroke=RackWindow.BrushOf("#2855A5"),StrokeThickness=2,StrokeLineJoin=PenLineJoin.Round};
      bin.Children.Add(basket);var label=new TextBlock{Text="完成收起",FontSize=11,Foreground=RackWindow.BrushOf("#2855A5")};SetLeft(label,3);SetTop(label,48);bin.Children.Add(label);
      SetLeft(bin,binCenter.X-28); SetTop(bin,binCenter.Y-28); SetZIndex(bin,10); Children.Add(bin);
    }
    bool CanDrop(Point p) {
      return (p-binCenter).Length<=35 || p.Y>RailTop+55+188+8 || p.Y<RailTop-6 || p.X<12 || p.X>Width-12;
    }
    void MoveSheet(Point p) {
      if(gesture==Gesture.Pending){
        gesture=Gesture.Drag;
        selectedSheet.RenderTransform=Transform.Identity;
        SetZIndex(selectedCard,9);
        ShowBin();
      }
      FloatPaper(p);
      if(!still){
        var delta=p-last;
        paperYaw.Angle=Math.Max(-19,Math.Min(19,(p.X-down.X)*.085+delta.X*.35));
        paperPitch.Angle=Math.Max(-12,Math.Min(12,-(p.Y-down.Y)*.055-delta.Y*.2));
        gust=Math.Max(-4,Math.Min(4,delta.X*.14));StartSpring();
      }
      last=p;
      bin.Opacity=CanDrop(p)?1:.76;
    }
    void ReturnPaper(){
      var start=new Point(floatingPaper.HorizontalOffset,floatingPaper.VerticalOffset);
      var home=ScreenDip(selectedSheet.TranslatePoint(new Point(0,0),this));
      var watch=System.Diagnostics.Stopwatch.StartNew();
      double yaw=paperYaw.Angle,pitch=paperPitch.Angle;
      returningPaper=true;gesture=Gesture.Finish;ReleaseMouseCapture();
      returnFlight=new DispatcherTimer{Interval=TimeSpan.FromMilliseconds(16)};
      returnFlight.Tick+=delegate{
        double t=watch.Elapsed.TotalSeconds;
        double spring=Math.Exp(-12*t)*Math.Cos(15*t);
        floatingPaper.HorizontalOffset=home.X-32+(start.X-home.X+32)*spring;
        floatingPaper.VerticalOffset=home.Y-32+(start.Y-home.Y+32)*spring;
        paperYaw.Angle=yaw*spring;paperPitch.Angle=pitch*spring;
        if(t>=.42)ResetPaper();
      };
      returnFlight.Start();
    }
    void FinishSheet(Point p) {
      string id=pressed;
      if(gesture!=Gesture.Drag || !CanDrop(p)){
        if(!still&&floatingPaper!=null)ReturnPaper();else{ReleaseMouseCapture();ResetPaper();}return;
      }
      gesture=Gesture.Finish;ReleaseMouseCapture();

      ThrowToBasket(id);
    }
  }
}
