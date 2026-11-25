using System;
using System.IO;
using System.Web.Script.Serialization;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Win32;
using Path = System.IO.Path;

namespace Clothesline {
  public sealed class WidgetPreferences {
    public double scale {get;set;}
    public double? left {get;set;}
    public double? top {get;set;}
    public bool companion {get;set;}
    public bool customFace {get;set;}
    public string template {get;set;}
    public WallMember[] members {get;set;}
    public string speaker {get;set;}
    public string motion {get;set;}
    public int interval {get;set;}
    public string[] phrases {get;set;}
    public bool reminders {get;set;}
    public WidgetPreferences(){scale=1;speaker="main";motion="spin";interval=60;members=new WallMember[0];phrases=new string[0];template="varsity";reminders=true;}
  }
  public partial class RackWindow {
    WidgetPreferences prefs;
    double logicalWidth;
    string SettingsPath { get { return Path.Combine(Path.GetDirectoryName(store.FilePath),"widget.json"); } }
    string FacePath { get { return Path.Combine(Path.GetDirectoryName(store.FilePath),"companion-face.png"); } }
    string BrandFile(string file){return Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"web","brand",file);}
    static BitmapSource LoadBitmap(string file,int decodeWidth) {
      int orientation=1;
      if(Path.GetExtension(file).Equals(".jpg",StringComparison.OrdinalIgnoreCase)||Path.GetExtension(file).Equals(".jpeg",StringComparison.OrdinalIgnoreCase)){
        using(var metadataStream=File.OpenRead(file)){
          var decoder=new JpegBitmapDecoder(metadataStream,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.None);var metadata=decoder.Frames[0].Metadata as BitmapMetadata;
          if(metadata!=null){var value=metadata.GetQuery("/app1/ifd/{ushort=274}");if(value!=null)orientation=Convert.ToInt32(value);}
        }
      }
      var bmp=new BitmapImage();bmp.BeginInit();bmp.CacheOption=BitmapCacheOption.OnLoad;bmp.DecodePixelWidth=decodeWidth;
      using(var stream=File.OpenRead(file)){bmp.StreamSource=stream;bmp.EndInit();}bmp.Freeze();
      Matrix transform=Matrix.Identity;
      switch(orientation){case 2:transform=new Matrix(-1,0,0,1,0,0);break;case 3:transform=new Matrix(-1,0,0,-1,0,0);break;case 4:transform=new Matrix(1,0,0,-1,0,0);break;case 5:transform=new Matrix(0,1,1,0,0,0);break;case 6:transform=new Matrix(0,1,-1,0,0,0);break;case 7:transform=new Matrix(0,-1,-1,0,0,0);break;case 8:transform=new Matrix(0,-1,1,0,0,0);break;}
      if(transform.IsIdentity)return bmp;
      // Decode EXIF orientation once into a frozen pixel source. Pursuit never changes the Image transform.
      var corrected=new TransformedBitmap(bmp,new MatrixTransform(transform));corrected.Freeze();return corrected;
    }
    readonly Canvas rigSurface=new Canvas();
    readonly System.Windows.Shapes.Line[] suspension={new System.Windows.Shapes.Line(),new System.Windows.Shapes.Line()};
    double rackDrop;
    void PositionRack(double left,double rackTop){
      var source=PresentationSource.FromVisual(this);
      var m=source==null?Matrix.Identity:source.CompositionTarget.TransformToDevice;
      var area=System.Windows.Forms.Screen.FromPoint(new System.Drawing.Point((int)((left+Width/2)*m.M11),(int)((rackTop+18)*m.M22))).WorkingArea;
      Left=Math.Max(area.Left/m.M11-Width/2+40,Math.Min(left,area.Right/m.M11-Width/2-40));
      Top=area.Top/m.M22;
      rackDrop=Math.Max(0,Math.Min(rackTop-Top,area.Height/m.M22-75*prefs.scale));
      if(rackDrop<12*prefs.scale)rackDrop=0;
      Canvas.SetTop(root,rackDrop);Height=rackDrop+330*prefs.scale;
      for(int i=0;i<2;i++){
        var line=suspension[i];line.X1=line.X2=Width*(i==0?.15:.85);line.Y1=0;line.Y2=rackDrop+51*prefs.scale;
        line.StrokeThickness=2.5*prefs.scale;
      }
    }
    void WireRackGrip(FrameworkElement grip){
      Point start=new Point();double x=0,y=0;
      grip.MouseLeftButtonDown+=delegate(object sender,MouseButtonEventArgs e){
        start=grip.PointToScreen(e.GetPosition(grip));x=Left;y=Top+rackDrop;grip.CaptureMouse();e.Handled=true;
      };
      grip.MouseMove+=delegate(object sender,MouseEventArgs e){if(!grip.IsMouseCaptured)return;
        var delta=grip.PointToScreen(e.GetPosition(grip))-start;
        var d=PresentationSource.FromVisual(this).CompositionTarget.TransformFromDevice.Transform(delta);
        PositionRack(x+d.X,y+d.Y);};
      grip.MouseLeftButtonUp+=delegate{if(grip.IsMouseCaptured){grip.ReleaseMouseCapture();SaveAppearance();}};
    }
    void LoadAppearance(){
      prefs=new WidgetPreferences();
      if(File.Exists(SettingsPath))try { prefs=new JavaScriptSerializer().Deserialize<WidgetPreferences>(File.ReadAllText(SettingsPath))??prefs; }
      catch(Exception e){System.Diagnostics.Debug.WriteLine(e);}
      foreach(var line in suspension){line.Stroke=new LinearGradientBrush(BrushOf("#555760").Color,BrushOf("#C1C5CE").Color,0);line.IsHitTestVisible=false;Panel.SetZIndex(line,-1);rigSurface.Children.Add(line);}
      logicalWidth=Width;
      ApplySize(prefs.scale);
      if(prefs.left.HasValue && prefs.top.HasValue){Left=prefs.left.Value;Top=prefs.top.Value;}
      SourceInitialized+=delegate{if(Left>-9000)KeepHandleVisible();else PositionTestCords();};
    }
    void PositionTestCords(){
      for(int i=0;i<2;i++){suspension[i].X1=suspension[i].X2=Width*(i==0?.15:.85);suspension[i].Y2=51*prefs.scale;suspension[i].StrokeThickness=2.5*prefs.scale;}
    }
    void KeepHandleVisible(){PositionRack(Left,Top+rackDrop);}
    void SaveAppearance(){
      prefs.left=Left;prefs.top=Top+rackDrop;
      string temp=SettingsPath+".tmp";
      File.WriteAllText(temp,new JavaScriptSerializer().Serialize(prefs));
      if(File.Exists(SettingsPath))File.Replace(temp,SettingsPath,null);else File.Move(temp,SettingsPath);
    }
    void ApplySize(double scale){
      prefs.scale=Math.Max(.55,Math.Min(1.65,scale));
      root.Width=logicalWidth;root.Height=330;root.LayoutTransform=new ScaleTransform(prefs.scale,prefs.scale);
      Width=logicalWidth*prefs.scale;Height=330*prefs.scale;
    }
    void Zoom(double direction){
      double mid=Left+Width/2;
      ApplySize(prefs.scale+direction*.1);Left=mid-Width/2;KeepHandleVisible();SaveAppearance();
    }
    FrameworkElement Buddy(double size, ImageSource overrideFace,string template=null,string sticker=null,bool useProfile=true){
      template=template??prefs.template;
      var canvas=new Canvas{Width=size,Height=size,IsHitTestVisible=false};
      if(template=="custom" && File.Exists(sticker??StickerPath)){canvas.Children.Add(new Image{Source=LoadBitmap(sticker??StickerPath,480),Width=size,Height=size,Stretch=Stretch.Uniform});canvas.Background=Brushes.Transparent;return canvas;}
      var style=StyleForBuddy(template);var rect=style.face;canvas.Background=Brushes.Transparent;
      ImageSource face=overrideFace;
      if(face==null && useProfile && prefs.customFace && File.Exists(FacePath))face=LoadBitmap(FacePath,320);
      double neck=size*(rect[1]+rect[3]+.016);
      var sprite=LoadBitmap(BrandFile(style.art+(face==null?".png":"-frame.png")),480);
      var lower=new Image{Source=sprite,Width=size,Height=size,Clip=new RectangleGeometry(new Rect(0,neck,size,size-neck))};canvas.Children.Add(lower);
      var head=new Canvas{Width=size,Height=size,Clip=new RectangleGeometry(new Rect(0,0,size,neck)),RenderTransform=new SkewTransform(0,0,size/2,neck)};
      canvas.Tag=head.RenderTransform;
      if(face!=null){
        double w=size*rect[2],h=size*rect[3];
        var photo=new Image{Source=face,Stretch=Stretch.Fill,Width=w,Height=h,Clip=new EllipseGeometry(new Rect(0,0,w,h))};
        Canvas.SetLeft(photo,size*rect[0]);Canvas.SetTop(photo,size*rect[1]);head.Children.Add(photo);
      }
      head.Children.Add(new Image{Source=sprite,Width=size,Height=size});canvas.Children.Add(head);
      return canvas;
    }
    void EditAvatar(Window owner,Action saved){
      var open=new OpenFileDialog{Filter="头像照片|*.png;*.jpg;*.jpeg;*.bmp",Title="选择头像照片"};
      if(open.ShowDialog(owner)!=true)return;
      CropAvatar(owner,open.FileName,saved);
    }
    void CropAvatar(Window owner,string fileName,Action saved){
      try {
        var source=LoadBitmap(fileName,1200);
        var dialog=Dialog("裁剪头像",365);dialog.Owner=owner;
        var panel=new StackPanel{Margin=new Thickness(20,8,20,20)};
        panel.Children.Add(Text("拖动照片对齐眼睛，再调整大小",13,"#565861"));
        var style=StyleForBuddy();var rect=style.face;const int width=200;int height=(int)Math.Round(width*rect[3]/rect[2]);
        var preview=new Canvas{Width=260,Height=260,Background=Brushes.Transparent,ClipToBounds=true};
        var face=new Canvas{Width=260*rect[2],Height=260*rect[3],ClipToBounds=true,Background=Brushes.White};
        face.Clip=new EllipseGeometry(new Rect(0,0,face.Width,face.Height));
        var pic=new Image{Source=source,Stretch=Stretch.Fill};
        face.Children.Add(pic); Canvas.SetLeft(face,260*rect[0]);Canvas.SetTop(face,260*rect[1]);preview.Children.Add(face);
        preview.Children.Add(new Image{Width=260,Height=260,Source=LoadBitmap(BrandFile(style.art+"-frame.png"),480),IsHitTestVisible=false});panel.Children.Add(preview);
        var zoom=new Slider{Minimum=1,Maximum=5,Value=1,Margin=new Thickness(12,5,12,14)};
        double left=0,top=0;
        Action constrain=delegate {
          left=Math.Min(0,Math.Max(face.Width-pic.Width,left));top=Math.Min(0,Math.Max(face.Height-pic.Height,top));
          Canvas.SetLeft(pic,left);Canvas.SetTop(pic,top);
        };
        Action resize=delegate {
          double u=pic.Width>0?(face.Width/2-left)/pic.Width:.5, v=pic.Height>0?(face.Height/2-top)/pic.Height:.5;
          double k=Math.Max(face.Width/source.PixelWidth,face.Height/source.PixelHeight)*zoom.Value;
          pic.Width=source.PixelWidth*k;pic.Height=source.PixelHeight*k;
          left=face.Width/2-u*pic.Width;top=face.Height/2-v*pic.Height;constrain();
        };
        resize();zoom.ValueChanged+=delegate{resize();};panel.Children.Add(zoom);
        Point previous=new Point();preview.Cursor=Cursors.SizeAll;
        preview.MouseLeftButtonDown+=delegate(object sender,MouseButtonEventArgs e){previous=e.GetPosition(preview);preview.CaptureMouse();};
        preview.MouseMove+=delegate(object sender,MouseEventArgs e){
          if(!preview.IsMouseCaptured)return;var pos=e.GetPosition(preview);left+=pos.X-previous.X;top+=pos.Y-previous.Y;previous=pos;constrain();
        };
        preview.MouseLeftButtonUp+=delegate{preview.ReleaseMouseCapture();};
        panel.Children.Add(ToolbarButton("使用这个头像",delegate{
          var visual=new DrawingVisual();
          using(var dc=visual.RenderOpen()){
            dc.PushClip(new EllipseGeometry(new Rect(0,0,width,height)));
            dc.DrawImage(source,new Rect(left*width/face.Width,top*height/face.Height,pic.Width*width/face.Width,pic.Height*height/face.Height));dc.Pop();
          }
          var bmp=new RenderTargetBitmap(width,height,96,96,PixelFormats.Pbgra32);bmp.Render(visual);
          var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bmp));
          var tmp=FacePath+".tmp";using(var file=File.Create(tmp))encoder.Save(file);
          if(File.Exists(FacePath))File.Replace(tmp,FacePath,null);else File.Move(tmp,FacePath);
          prefs.customFace=true;prefs.companion=true;SaveAppearance();Rebuild();dialog.Close();saved();
        },true));
        ShowSheet(dialog,panel);
      }catch(Exception ex){MessageBox.Show(owner,ex.Message,"无法读取头像");}
    }
    void OpenAppearance(){
      var dialog=Dialog("桌面外观",340);var panel=new StackPanel{Margin=new Thickness(20)};
      panel.Children.Add(Btn("我的搭子 · 统一照片编辑器",()=>{dialog.Close();OpenUrl(host.Origin+"/#companions");}));
      panel.Children.Add(Text("照片、造型和提醒方式在同一编辑器保存后同步。",12,"#586659"));
      panel.Children.Add(Text("桌面缩放",13,"#25262A"));var slider=new Slider{Minimum=.55,Maximum=1.65,Value=prefs.scale,Margin=new Thickness(4,10,4,15)};
      slider.ValueChanged+=delegate{ApplySize(slider.Value);KeepHandleVisible();};panel.Children.Add(slider);dialog.Closed+=delegate{SaveAppearance();};ShowSheet(dialog,panel);
    }
    void ShowSheet(Window window,FrameworkElement body){
      window.Resources.MergedDictionaries.Add((ResourceDictionary)System.Windows.Markup.XamlReader.Parse(@"
        <ResourceDictionary xmlns=""http://schemas.microsoft.com/winfx/2006/xaml/presentation"" xmlns:x=""http://schemas.microsoft.com/winfx/2006/xaml"">
          <Style TargetType=""TextBox"">
            <Setter Property=""Background"" Value=""#F2F3F7""/><Setter Property=""BorderBrush"" Value=""#DADDE5""/>
            <Setter Property=""Template""><Setter.Value><ControlTemplate TargetType=""TextBox"">
              <Border x:Name=""field"" Background=""{TemplateBinding Background}"" BorderBrush=""{TemplateBinding BorderBrush}"" BorderThickness=""1"" CornerRadius=""9"" Padding=""{TemplateBinding Padding}""><ScrollViewer x:Name=""PART_ContentHost""/></Border>
              <ControlTemplate.Triggers><Trigger Property=""IsKeyboardFocused"" Value=""True""><Setter TargetName=""field"" Property=""BorderBrush"" Value=""#2855B1""/></Trigger></ControlTemplate.Triggers>
            </ControlTemplate></Setter.Value></Setter>
          </Style>
        </ResourceDictionary>"));
      var content=new DockPanel {LastChildFill=true};
      var top=new DockPanel{Margin=new Thickness(20,13,12,8)};
      var dismiss=ToolbarButton("关闭",window.Close); DockPanel.SetDock(dismiss,Dock.Right);top.Children.Add(dismiss);
      var header=Text(window.Title.Replace("晾一晾便签 · ",""),16,"#202126");header.FontWeight=FontWeights.SemiBold;header.VerticalAlignment=VerticalAlignment.Center;
      top.Children.Add(header);DockPanel.SetDock(top,Dock.Top);content.Children.Add(top);
      content.Children.Add(new ScrollViewer {Content=body,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
      window.Content=new Border {CornerRadius=new CornerRadius(22),Background=BrushOf("#FCFCFE"),BorderBrush=BrushOf("#DADDE5"),BorderThickness=new Thickness(1),Child=content};
      window.PreviewKeyDown+=delegate(object sender,KeyEventArgs e){if(e.Key==Key.Escape)window.Close();};
      window.ShowDialog();
    }
  }
}
