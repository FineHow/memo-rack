import { useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Check,
  Copy,
  Globe,
  MessageSquare,
  Music2,
  ScanLine,
  UsersRound,
} from "lucide-react";

const account = "像素无限Pixel Infinity";
const website = "https://xiangsuwuxian.gulu9832.xyz/";
const channels = [
  {
    name: "小红书",
    file: "xiaohongshu",
    detail: "小红书号：11629880157",
    call: "扫码关注 · 获取更新",
    action: "关注更新",
    hint: "用小红书扫一扫，关注工作室并查看作品更新。",
    icon: Bell,
  },
  {
    name: "微信公众号",
    file: "wechat",
    detail: account,
    call: "扫码关注 · 持续更新",
    action: "产品建议",
    hint: "用微信扫一扫，关注公众号后，在对话框里写下你的使用建议。",
    icon: MessageSquare,
  },
  {
    name: "抖音",
    file: "douyin",
    detail: account,
    call: "扫码关注抖音账号",
    action: "抖音账号",
    hint: "也可以在抖音搜索「像素无限Pixel Infinity」找到我们。",
    icon: Music2,
  },
] as const;
type Channel = (typeof channels)[number];

export function StudioDetails() {
  const [copied, setCopied] = useState("");
  const [selected, setSelected] = useState<Channel | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const backButton = useRef<HTMLButtonElement>(null);

  function showChannel(channel: Channel, trigger: HTMLElement) {
    returnFocus.current = trigger;
    setSelected(channel);
    requestAnimationFrame(() => backButton.current?.focus());
  }
  function hideChannel() {
    setSelected(null);
    requestAnimationFrame(() => returnFocus.current?.focus());
  }

  async function copyAccount() {
    try {
      await navigator.clipboard.writeText(account);
      setCopied("已复制账号名");
    } catch {
      setCopied("请选中并复制：" + account);
    }
  }

  return (
    <section className="studio-sheet" aria-label="像素无限工作室与产品">
      <div className="studio-story">
        <div className="studio-lockup">
          <img src="/brand/pixel-infinity.jpg" alt="" width="68" height="68" />
          <div>
            <h3>像素无限工作室</h3>
            <small lang="en">PIXEL INFINITY</small>
          </div>
        </div>
        <p className="studio-motto">把日常，做的有趣。</p>
        <article className="studio-product">
          <div>
            <h4>晾一晾</h4>
            <span>Windows · v1.0</span>
          </div>
          <div className="studio-product-art" aria-hidden="true">
            <img src="/brand/app-icon.png" alt="" width="68" height="68" />
          </div>
        </article>
        <p>
          我们是像素无限工作室，喜欢把日常做成有趣、好用的软件与内容。“晾一晾便签”是我们做的一款桌面待办产品。
        </p>
        <p>
          如果你喜欢这个软件，想了解我们的新作品，或有改进建议，欢迎通过下方方式找到我们。
        </p>
        <div className="studio-contact">
          <a
            className="studio-domain"
            href={website}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Globe size={15} />
            <span>官网：{website}</span>
            <ArrowUpRight size={14} />
          </a>
          <div className="studio-actions">
            <a
              className="studio-site"
              href={website}
              target="_blank"
              rel="noopener noreferrer"
            >
              访问官网 <ArrowUpRight size={16} />
            </a>
            <button className="copy-studio" onClick={copyAccount}>
              {copied === "已复制账号名" ? (
                <Check size={15} />
              ) : (
                <Copy size={15} />
              )}
              复制账号名
            </button>
          </div>
          <span className="copy-result" role="status">
            {copied}
          </span>
        </div>
      </div>
      <div className="studio-follow">
        <h3>
          <UsersRound size={20} />
          关注我们 / 获取更新 / 反馈建议
        </h3>
        <p>
          你可以在以下平台关注我们，了解新作品、获取更新动态，或向我们反馈你的使用建议。
        </p>
        <div className="channel-grid" hidden={!!selected}>
          {channels.map((ch) => (
            <button
              className={"channel-card channel-" + ch.file}
              key={ch.file}
              onClick={(e) => showChannel(ch, e.currentTarget)}
              aria-label={ch.name + " · " + ch.call}
            >
              <span className="channel-heading">
                <img
                  src={"/brand/" + ch.file + "-logo.jpg"}
                  alt=""
                  width="29"
                  height="29"
                />
                <strong>{ch.name}</strong>
              </span>
              <small>{ch.detail}</small>
              <span className="channel-code">
                <img
                  src={"/brand/" + ch.file + ".jpg"}
                  alt={ch.name + "工作室账号卡"}
                  onLoad={(e) => {
                    const image = e.currentTarget;
                    image.classList.toggle(
                      "portrait-code",
                      ch.file === "douyin" &&
                        image.naturalWidth === 658 &&
                        image.naturalHeight === 898,
                    );
                  }}
                />
              </span>
              <span className="channel-caption">
                <ScanLine size={14} />
                {ch.call}
              </span>
            </button>
          ))}
        </div>
        {selected && (
          <div className="channel-detail">
            <button
              ref={backButton}
              onClick={hideChannel}
              className="channel-back"
            >
              <ArrowLeft size={15} />
              返回平台列表
            </button>
            <div className="channel-heading">
              <img
                src={"/brand/" + selected.file + "-logo.jpg"}
                alt=""
                width="29"
                height="29"
              />
              <strong>{selected.name}</strong>
            </div>
            <img
              className="channel-original"
              src={"/brand/" + selected.file + ".jpg"}
              alt={selected.name + "完整账号卡"}
            />
            <p>{selected.hint}</p>
          </div>
        )}
        <div className="channel-links" hidden={!!selected}>
          {[channels[1], channels[0], channels[2]].map((ch) => (
            <button
              key={ch.file}
              onClick={(e) => showChannel(ch, e.currentTarget)}
            >
              <ch.icon size={14} />
              {ch.action}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
