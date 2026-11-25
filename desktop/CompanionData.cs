using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
namespace Clothesline {
  public static class AtomicFile {
    public static void Write(string file,string text){
      var tmp=file+".tmp";var bytes=new UTF8Encoding(false).GetBytes(text);
      using(var stream=new FileStream(tmp,FileMode.Create,FileAccess.Write,FileShare.None)){stream.Write(bytes,0,bytes.Length);stream.Flush(true);}
      if(File.Exists(file))File.Replace(tmp,file,file+".bak",true);else File.Move(tmp,file);
    }
  }
  public class PhotoEdit {
    public double stretchX{get;set;} public double stretchY{get;set;} public double zoom{get;set;} public double x{get;set;} public double y{get;set;} public double rotation{get;set;}
    public string ratio{get;set;} public string frame{get;set;} public double anchor{get;set;} public double headX{get;set;} public double headY{get;set;} public double headScale{get;set;}
    public PhotoEdit(){stretchX=stretchY=zoom=headScale=1;ratio="original";frame="plain";anchor=.16;}
  }
  public class Dialogue {
    public string[] chat{get;set;} public string[] near{get;set;} public string[] overdue{get;set;} public string[] done{get;set;}
    public Dialogue(){chat=near=overdue=done=new string[0];}
    public string[] Lines(string phase){switch(phase){case "chat":return chat;case "near":return near;case "overdue":return overdue;case "done":return done;default:throw new ArgumentException("未知台词场景");}}
    static string[] Clean(string[] lines){
      if(lines==null||lines.Length>40||lines.Any(line=>line==null||line.Trim().Length>120))throw new Exception("每种场景最多 40 句，每句最多 120 字");
      return lines.Select(line=>line.Trim()).Where(line=>line.Length>0).ToArray();
    }
    public void Validate(){chat=Clean(chat);near=Clean(near);overdue=Clean(overdue);done=Clean(done);}
  }
  public class CustomDoll {public string openingMask{get;set;} public string source{get;set;} public string cutout{get;set;} public double[][] opening{get;set;}}
  public class Friend {
    public const string CatPhoto="/brand/starter-cat.jpg";
    public CustomDoll customDoll{get;set;}
    public string id{get;set;} public string name{get;set;} public string mode{get;set;} public string template{get;set;}
    public string original{get;set;} public string working{get;set;} public string repairSource{get;set;} public string result{get;set;} public string chasePhoto{get;set;}
    public Dialogue dialogue{get;set;}
    public PhotoEdit edit{get;set;} public string tone{get;set;} public string[] phrases{get;set;} public string phraseMode{get;set;}
    public Friend(){name="新好友";mode="doll";template="varsity";original=result=chasePhoto="";edit=new PhotoEdit();tone="gentle";phraseMode="mixed";phrases=new string[0];}
  }
  public class Friends {
    public int version{get;set;} public int revision{get;set;} public Friend[] members{get;set;} public string currentId{get;set;} public string[] displayedIds{get;set;}
    public bool enabled{get;set;} public bool reminders{get;set;} public int interval{get;set;} public string motion{get;set;} public int nearSeconds{get;set;} public bool chaseEnabled{get;set;} public int chaseSeconds{get;set;} public bool allMembers{get;set;}
    public bool autoChat{get;set;} public int chatSeconds{get;set;} public string relief{get;set;}
    public bool starterApplied{get;set;}
    public Friends(){autoChat=true;chatSeconds=60;relief="off";version=2;members=new Friend[0];currentId="";displayedIds=new string[0];reminders=chaseEnabled=true;interval=60;motion="swing";nearSeconds=chaseSeconds=6;}
    public void Validate(){
      if(version!=2||revision<0||members==null||displayedIds==null||displayedIds.Distinct().Count()!=displayedIds.Length)throw new Exception("搭子文件无效");
      var ids=new HashSet<string>();
      foreach(var m in members){
        if(m==null)throw new Exception("搭子记录损坏");if(m.name!=null)m.name=m.name.Trim();
        if(m.mode=="sticker")m.mode="photo";
        if(String.IsNullOrWhiteSpace(m.name)||m.name.Length>40)throw new Exception("请填写搭子姓名，最多 40 字");
        if(m.phrases!=null)m.phrases=m.phrases.Select(p=>p==null?null:p.Trim()).Where(p=>!String.IsNullOrEmpty(p)).ToArray();
        if(m.phraseMode=="only"&&(m.phrases==null||m.phrases.Length==0))throw new Exception("只使用我的台词时，请至少填写一句台词");
        if(!System.Text.RegularExpressions.Regex.IsMatch(m.id??"",@"^[a-zA-Z0-9_-]{1,80}$")||!ids.Add(m.id)||String.IsNullOrWhiteSpace(m.name)||m.name.Length>40||!new[]{"doll","sticker","photo"}.Contains(m.mode)||!new[]{"gentle","boss","fun"}.Contains(m.tone)||!new[]{"mixed","only"}.Contains(m.phraseMode)||m.edit==null||m.phrases==null||m.phrases.Length>40||m.phrases.Any(p=>p==null||p.Length>120))throw new Exception("搭子记录损坏");
        if(m.dialogue==null)m.dialogue=new Dialogue{near=m.phrases,overdue=m.phrases};
        m.dialogue.Validate();
        var custom=m.customDoll;
        if((m.template=="uploaded"&&custom==null)||(custom!=null&&(String.IsNullOrEmpty(custom.source)||String.IsNullOrEmpty(custom.cutout)||custom.opening==null||custom.opening.Length<3||custom.opening.Length>2048||custom.opening.Any(p=>p==null||p.Length!=2||p.Any(v=>Double.IsNaN(v)||v<0||v>1)))))throw new Exception("无效的自定义模板");
        foreach(var r in new[]{custom==null?"":custom.source,custom==null?"":custom.cutout,custom==null?"":custom.openingMask??"",m.original,m.working??"",m.repairSource??"",m.result,m.chasePhoto})if(r==null||(r!=""&&r!=Friend.CatPhoto&&!System.Text.RegularExpressions.Regex.IsMatch(r,@"^/assets/[a-f0-9]{64}\.(png|jpg|webp)$")))throw new Exception("素材引用无效");
        if(!new[]{"original","1:1","3:4","4:3","9:16"}.Contains(m.edit.ratio)||!new[]{"plain","white","dark"}.Contains(m.edit.frame))throw new Exception("照片编辑参数无效");
        if(new[]{m.edit.stretchX,m.edit.stretchY}.Any(v=>Double.IsNaN(v)||v<.7||v>1.3))throw new Exception("脸部比例无效");
        foreach(var v in new[]{m.edit.zoom,m.edit.x,m.edit.y,m.edit.rotation,m.edit.anchor,m.edit.headX,m.edit.headY,m.edit.headScale})if(Double.IsNaN(v)||Double.IsInfinity(v)||Math.Abs(v)>10000)throw new Exception("编辑参数无效");
      }
      if(chatSeconds<10||chatSeconds>3600||!new[]{"off","slap","sling","both"}.Contains(relief))throw new Exception("陪伴设置无效");
      if(!String.IsNullOrEmpty(currentId) && (enabled || displayedIds.Contains(currentId)))displayedIds=new[]{currentId}.Concat(displayedIds.Where(id=>id!=currentId)).ToArray();
      if((currentId!=""&&!ids.Contains(currentId))||displayedIds.Any(id=>!ids.Contains(id))||interval<10||interval>3600||nearSeconds<1||nearSeconds>60||chaseSeconds<1||chaseSeconds>60||!new[]{"swing","mirror","lash","text"}.Contains(motion))throw new Exception("提醒设置无效");
    }
  }
  public static partial class Rules {
    public static bool? TestReducedMotion;
    public static bool Quiet(State state,double now){return state.settings.quiet||state.settings.quietUntil>now;}
    public static string Phase(Todo t,State s,double now){
      if(t.completedAt.HasValue)return "completed";if(t.cancelledAt.HasValue)return "cancelled";if(Quiet(s,now))return "quiet";
      if(t.snoozedUntil>now)return s.currentTaskId==t.id?"processing":"snoozed";
      return now>=t.dueAt?"overdue":t.dueAt-now<=s.settings.urgentMinutes*60000?"near":"normal";
    }
    public static Todo NextReminder(State s,double now){return s.tasks.Where(t=>{
      var phase=Phase(t,s,now);return (phase=="near"||phase=="overdue")&&t.cooldownUntil<=now&&(t.lastReminderPhase!=phase||t.nextReminderAt<=now);
    }).OrderBy(t=>t.lastReminderPhase!=Phase(t,s,now)?0:1).ThenBy(t=>t.lastReminderAt).ThenBy(t=>t.dueAt).ThenBy(t=>t.id,StringComparer.Ordinal).FirstOrDefault();}
  }
  public static class DesktopPlacement {
    public static System.Windows.Point Clamp(System.Windows.Point p,System.Windows.Rect area,System.Windows.Size extent){
      return new System.Windows.Point(Math.Max(area.Left,Math.Min(p.X,area.Right-extent.Width)),Math.Max(area.Top,Math.Min(p.Y,area.Bottom-extent.Height)));
    }
    public static System.Windows.Point FollowTarget(System.Windows.Point cursor,System.Windows.Rect area,System.Windows.Size extent){
      double x=cursor.X+60;if(x+extent.Width>area.Right)x=cursor.X-extent.Width-60;
      return Clamp(new System.Windows.Point(x,cursor.Y+35),area,extent);
    }
  }
  public partial class RackWindow {
    Friends friends;
    string FriendsPath{get{return Path.Combine(Path.GetDirectoryName(store.FilePath),"companions-v2.json");}}
    string AssetRoot{get{return Path.Combine(Path.GetDirectoryName(store.FilePath),"assets");}}
    string AssetFile(string reference){if(reference==Friend.CatPhoto)return BrandFile("starter-cat.jpg");return String.IsNullOrEmpty(reference)?null:Path.Combine(AssetRoot,Path.GetFileName(reference));}
    string ImportAsset(string file){return File.Exists(file)?WriteAsset(File.ReadAllBytes(file),"png"):"";}
    readonly Dictionary<string,Tuple<long,long,bool>> assetChecks=new Dictionary<string,Tuple<long,long,bool>>();
    bool AssetHealthy(string reference){
      var file=AssetFile(reference);if(!File.Exists(file))return false;if(reference==Friend.CatPhoto)return true;var info=new FileInfo(file);Tuple<long,long,bool> cached;
      if(assetChecks.TryGetValue(file,out cached)&&cached.Item1==info.Length&&cached.Item2==info.LastWriteTimeUtc.Ticks)return cached.Item3;
      string hash;using(var sha=SHA256.Create())using(var stream=File.OpenRead(file))hash=BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
      bool valid=hash==Path.GetFileNameWithoutExtension(file);assetChecks[file]=Tuple.Create(info.Length,info.LastWriteTimeUtc.Ticks,valid);return valid;
    }
    System.Windows.Media.Imaging.BitmapSource PhotoSource(string reference,int width){
      if(String.IsNullOrEmpty(reference))return null;
      try{if(!AssetHealthy(reference))return null;return LoadBitmap(AssetFile(reference),width);}catch(IOException){return null;}catch(NotSupportedException){return null;}catch(System.IO.FileFormatException){return null;}catch(ArgumentException){return null;}
    }
    string WriteAsset(byte[] data,string ext){
      if(data.Length>20*1024*1024)throw new Exception("照片不能超过 20MB");
      using(var input=new MemoryStream(data)){var decoder=System.Windows.Media.Imaging.BitmapDecoder.Create(input,System.Windows.Media.Imaging.BitmapCreateOptions.PreservePixelFormat,System.Windows.Media.Imaging.BitmapCacheOption.OnLoad);var f=decoder.Frames[0];if((long)f.PixelWidth*f.PixelHeight>40000000)throw new Exception("照片像素过大");}
      string hash;using(var sha=SHA256.Create())hash=BitConverter.ToString(sha.ComputeHash(data)).Replace("-","").ToLowerInvariant();
      Directory.CreateDirectory(AssetRoot);var file=Path.Combine(AssetRoot,hash+"."+ext);var reference="/assets/"+hash+"."+ext;
      if(!AssetHealthy(reference)){
        using(var stream=new FileStream(file+".tmp",FileMode.Create,FileAccess.Write,FileShare.None)){stream.Write(data,0,data.Length);stream.Flush(true);}
        if(File.Exists(file))File.Replace(file+".tmp",file,file+".corrupt-"+DateTime.UtcNow.Ticks);else File.Move(file+".tmp",file);assetChecks.Remove(file);
      }return reference;
    }
    Friends StarterCrew(int revision){
      var cat=new Friend{id="starter-cat",name="小猫",mode="photo",original=Friend.CatPhoto,result=Friend.CatPhoto};
      return new Friends{starterApplied=true,revision=revision,members=new[]{cat},currentId=cat.id,displayedIds=new[]{cat.id},enabled=true,allMembers=true,motion="mirror",relief="sling"};
    }
    void LoadCompanions(){
      if(File.Exists(FriendsPath)){friends=new JavaScriptSerializer { MaxJsonLength=30000000 }.Deserialize<Friends>(File.ReadAllText(FriendsPath));friends.Validate();if(!friends.starterApplied&&friends.members.Length==0){friends=StarterCrew(friends.revision+1);friends.Validate();AtomicFile.Write(FriendsPath,new JavaScriptSerializer().Serialize(friends));}return;}
      friends=new Friends();
      if(prefs.companion||prefs.members.Length>0||File.Exists(FacePath)||File.Exists(StickerPath)){
        var main=new Friend{id="legacy-main",name="我的搭子",phrases=prefs.phrases,template=prefs.template,original=ImportAsset(StickerActive?StickerPath:FacePath),mode=StickerActive?"photo":"doll"};main.result=main.chasePhoto=main.original;
        var members=new List<Friend>{main};foreach(var m in prefs.members){var photo=ImportAsset(MemberFile(m));members.Add(new Friend{id=m.id,name=m.name??"我的搭子",template=m.template,mode=m.template=="custom"?"photo":"doll",original=photo,result=photo,chasePhoto=photo,phrases=prefs.phrases});}
        friends.members=members.ToArray();friends.currentId=prefs.speaker=="main"?main.id:members.Any(m=>m.id==prefs.speaker)?prefs.speaker:main.id;
        friends.displayedIds=new[]{friends.currentId}.Concat(members.Where(m=>m.id!=friends.currentId).Select(m=>m.id)).ToArray();friends.enabled=prefs.companion;friends.reminders=prefs.reminders;friends.interval=Math.Max(10,Math.Min(3600,prefs.interval));friends.motion=prefs.motion=="mirror"?"mirror":prefs.motion=="lash"?"lash":"swing";
      }
      if(friends.members.Length==0)friends=StarterCrew(0);
      friends.Validate();AtomicFile.Write(FriendsPath,new JavaScriptSerializer().Serialize(friends));
    }
  }
}
