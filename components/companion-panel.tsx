"use client";
import { useCallback, useState } from "react";
import {
  EMPTY_COMPANIONS,
  newCompanion,
  dialogueFor,
  type Companion,
  type CompanionState,
} from "@/lib/companion";
import {
  saveCompanions,
  useCompanions,
  retryCompanions,
  restoreCompanionBackup,
  nativeToken,
} from "@/lib/companion-store";
import { isQuiet } from "@/lib/reminders";
import { useLaundry, useClock, dispatchLaundry } from "@/lib/laundry-store";
import defaults from "@/public/brand/dialogue.json";
import { Modal } from "./laundry-dialogs";
import { PhotoEditor } from "./photo-editor";
import { CompanionRack, MemberArt } from "./companion-rack";
export async function companionSettings(action: string) {
  if (action !== "read") throw Error("请在我的搭子中保存设置");
  const { companionRequest, nativeToken } = await import(
    "@/lib/companion-store"
  );
  if (nativeToken()) return companionRequest("read2");
  return {
    ...EMPTY_COMPANIONS,
    ...JSON.parse(localStorage.getItem("memo-rack-companion-v2") || "{}"),
  };
}
export function CompanionPanel() {
  const saved = useCompanions();
  const laundry = useLaundry(),
    now = useClock();
  const [draft, setDraft] = useState<CompanionState | null>(null),
    [selected, setSelected] = useState(""),
    [editor, setEditor] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    "remove" | "restore" | null
  >(null);
  const closeConfirm = useCallback(() => setConfirmAction(null), []);
  const closeEditor = useCallback(() => setEditor(false), []);
  const pref = draft || saved.state,
    member =
      pref.members.find((m) => m.id === selected) ||
      pref.members.find((m) => m.id === pref.currentId) ||
      pref.members[0];
  function change(next: CompanionState) {
    setDraft(next);
    setNotice("尚未上架 · 草稿");
    setError("");
  }
  function update(m: Companion) {
    change({
      ...pref,
      members: pref.members.map((v) => (v.id === m.id ? m : v)),
    });
  }
  function add() {
    const m = newCompanion(crypto.randomUUID());
    change({
      ...pref,
      members: [...pref.members, m],
      currentId: pref.currentId || m.id,
      enabled: true,
      displayedIds: [...pref.displayedIds, m.id],
    });
    setSelected(m.id);
    setNotice("新好友尚未上架，请编辑照片");
  }
  return (
    <section className="companion-page">
      <div className="page-heading">
        <div>
          <h1>我的搭子</h1>
          <p>选搭子 → 编辑造型 → 提醒方式</p>
        </div>
        <button
          className="button primary"
          disabled={!saved.ready}
          onClick={add}
        >
          ＋ 添加好友
        </button>
      </div>
      <div className="companion-save-state" role="status">
        <span className={draft ? "draft-badge" : "saved-badge"}>
          {saved.saving
            ? "保存中…"
            : draft
              ? "尚未上架 · 草稿"
              : saved.ready
                ? "已保存"
                : "读取中…"}
        </span>
        <span>
          {notice && !notice.includes("草稿") && !notice.startsWith("已保存")
            ? notice
            : draft
              ? "更改尚未上架。"
              : ""}
        </span>
      </div>
      {(error || saved.error) && (
        <p role="alert" className="form-error">
          {error || saved.error}
          {(saved.error || error.includes("重试读取")) && (
            <span className="error-recovery-actions">
              <button
                className="button"
                onClick={() =>
                  void retryCompanions()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                重试读取
              </button>
              {!nativeToken() && (
                <button
                  className="button"
                  onClick={() => setConfirmAction("restore")}
                >
                  恢复搭子备份
                </button>
              )}
            </span>
          )}
        </p>
      )}
      <section className="member-shelf">
        <div className="flow-step-heading">
          <span>01</span>
          <div>
            <h2>选搭子</h2>
            <p>编辑对象与当前陪伴分别选择。</p>
          </div>
        </div>
        <div className="member-library" aria-label="搭子选择">
          {pref.members.map((m) => (
            <button
              key={m.id}
              className={member?.id === m.id ? "selected" : ""}
              onClick={() => {
                setSelected(m.id);
                setNotice(
                  `正在编辑 ${m.name}，当前陪伴为 ${pref.members.find((v) => v.id === pref.currentId)?.name || "未选择"}`,
                );
              }}
            >
              <span>
                <MemberArt member={m} />
              </span>
              <b>{m.name}</b>
              <small>
                {m.id === pref.currentId
                  ? "当前陪伴"
                  : pref.displayedIds.includes(m.id)
                    ? "已上架"
                    : "成员库"}
              </small>
            </button>
          ))}
        </div>
      </section>
      <div className="companion-setup-grid">
        <div className="preview-column">
          <CompanionRack
            preferences={pref}
            onReorder={(displayedIds) => change({ ...pref, displayedIds })}
            selectedId={member?.id}
            previewOnly
            onMember={(id) => {
              setSelected(id);
              setNotice(
                `正在编辑 ${pref.members.find((m) => m.id === id)?.name}`,
              );
            }}
          />
          {member && (
            <fieldset className="dialogue-fields">
              <legend>搭子的台词</legend>
              <p>每行一句，搭子会随机选一句。留空使用默认台词。</p>
              {(
                [
                  ["chat", "平时聊天"],
                  ["near", "快超时"],
                  ["overdue", "已超时"],
                  ["done", "完成后"],
                ] as const
              ).map(([key, label]) => {
                const lines = dialogueFor(member)[key];
                const values = lines.length ? lines : [""];
                const setLines = (entries: string[]) =>
                  update({
                    ...member,
                    dialogue: { ...dialogueFor(member), [key]: entries },
                    phrases: [],
                    phraseMode: "mixed",
                  });
                return (
                  <div className="field phrase-group" key={key}>
                    <strong>{label}</strong>
                    {values.map((line, index) => (
                      <div className="phrase-row" key={index}>
                        <textarea
                          rows={1}
                          aria-label={label + "第" + (index + 1) + "句"}
                          placeholder={defaults[key][
                            index % defaults[key].length
                          ].replace("{任务名}", "出门散散步")}
                          value={line}
                          onChange={(e) =>
                            setLines([
                              ...values.slice(0, index),
                              ...e.target.value.split("\n"),
                              ...values.slice(index + 1),
                            ])
                          }
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              if (values.length >= 40) return;
                              const group = e.currentTarget.closest(".field");
                              setLines([
                                ...values.slice(0, index + 1),
                                "",
                                ...values.slice(index + 1),
                              ]);
                              requestAnimationFrame(() =>
                                group
                                  ?.querySelectorAll("textarea")
                                  [index + 1]?.focus(),
                              );
                            }
                          }}
                        />
                        {values.length > 1 && (
                          <button
                            className="text-button"
                            aria-label={
                              "删除" + label + "第" + (index + 1) + "句"
                            }
                            onClick={() =>
                              setLines(values.filter((_, i) => i !== index))
                            }
                          >
                            移除
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      className="text-button add-phrase"
                      disabled={values.length >= 40}
                      onClick={() => setLines([...values, ""])}
                    >
                      ＋ 添加一句
                    </button>
                    {key === "chat" && (
                      <>
                        <label className="check-line">
                          <input
                            type="checkbox"
                            checked={pref.autoChat}
                            onChange={(e) =>
                              change({ ...pref, autoChat: e.target.checked })
                            }
                          />
                          主陪主动聊天
                        </label>
                        {pref.autoChat && isQuiet(laundry.state, now) && (
                          <small>
                            挂件处于安静模式，恢复提醒后会主动聊天。
                          </small>
                        )}
                        {pref.autoChat && !pref.enabled && (
                          <small>
                            开启「显示陪伴成员」后，主陪会在桌面开口。
                          </small>
                        )}
                        {pref.autoChat && (
                          <label className="field">
                            主动聊天间隔（秒）
                            <input
                              type="number"
                              min={10}
                              max={3600}
                              value={pref.chatSeconds}
                              onChange={(e) =>
                                change({
                                  ...pref,
                                  chatSeconds: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </fieldset>
          )}
        </div>
        <div className="edit-column">
          <section className="companion-edit">
            <div className="flow-step-heading">
              <span>02</span>
              <div>
                <h2>编辑造型</h2>
                <p>
                  {member
                    ? "正在编辑 · " + member.name
                    : "先添加搭子，再选择照片卡或陪伴小人。"}
                </p>
              </div>
            </div>
            {!member ? (
              <button className="button primary" onClick={add}>
                添加搭子
              </button>
            ) : (
              <>
                <label className="field">
                  姓名
                  <input
                    maxLength={40}
                    value={member.name}
                    onChange={(e) =>
                      update({ ...member, name: e.target.value })
                    }
                  />
                </label>
                <div className="heading-actions">
                  <button
                    className="button primary"
                    onClick={() => setEditor(true)}
                  >
                    编辑照片与造型
                  </button>
                </div>
                <div className="member-secondary-actions">
                  <button
                    className="button"
                    disabled={pref.currentId === member.id}
                    onClick={() =>
                      change({
                        ...pref,
                        currentId: member.id,
                        displayedIds: [
                          member.id,
                          ...pref.displayedIds.filter((id) => id !== member.id),
                        ],
                      })
                    }
                  >
                    {pref.currentId === member.id ? "正在陪伴" : "设为当前陪伴"}
                  </button>
                  <button
                    className="button"
                    disabled={member.id === pref.currentId}
                    onClick={() => {
                      if (pref.displayedIds.includes(member.id)) {
                        change({
                          ...pref,
                          displayedIds: pref.displayedIds.filter(
                            (id) => id !== member.id,
                          ),
                        });
                      } else
                        change({
                          ...pref,
                          displayedIds: [...pref.displayedIds, member.id],
                        });
                    }}
                  >
                    {pref.displayedIds.includes(member.id) ? "收起" : "上架"}
                  </button>
                </div>

                <button
                  className="text-button"
                  onClick={() => setConfirmAction("remove")}
                >
                  移除好友
                </button>
              </>
            )}
          </section>
          <div className="reminder-preferences">
            <div className="flow-step-heading">
              <span>03</span>
              <div>
                <h2>提醒方式</h2>
                <p>临期挂在杆上提醒，真正超时后再追逐。</p>
              </div>
            </div>
            <div className="reminder-tiles">
              <section>
                <h3>挂架互动</h3>{" "}
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={pref.enabled}
                    onChange={(e) =>
                      change({ ...pref, enabled: e.target.checked })
                    }
                  />{" "}
                  显示陪伴成员
                </label>
                <p>主陪固定在左侧。左右拖动其他搭子的挂钩可以排序。</p>
                <fieldset className="relief-options">
                  <legend>解压玩法</legend>
                  {(
                    [
                      ["slap", "重拍好友", "轻点旋转"],
                      ["sling", "拉绳弹飞", "拉远后松手"],
                    ] as const
                  ).map(([game, label, hint]) => (
                    <label key={game}>
                      <input
                        type="checkbox"
                        checked={pref.relief === game || pref.relief === "both"}
                        onChange={(e) => {
                          const other = game === "slap" ? "sling" : "slap";
                          const hasOther =
                            pref.relief === other || pref.relief === "both";
                          change({
                            ...pref,
                            relief: e.target.checked
                              ? hasOther
                                ? "both"
                                : game
                              : hasOther
                                ? other
                                : "off",
                          });
                        }}
                      />
                      <span>
                        {label}
                        <small>{hint}</small>
                      </span>
                    </label>
                  ))}
                  <button
                    className="text-button"
                    disabled={pref.relief === "off"}
                    onClick={() => change({ ...pref, relief: "off" })}
                  >
                    {pref.relief === "off" ? "玩法已关闭" : "关闭全部玩法"}
                  </button>
                </fieldset>
              </section>
              <section>
                <h3>任务提醒</h3>{" "}
                <p>快超时和已超时会自动冒泡。开启安静后暂停提醒。</p>
                <label className="field">
                  临期动作
                  <select
                    value={pref.motion}
                    onChange={(e) =>
                      change({
                        ...pref,
                        motion: e.target.value as CompanionState["motion"],
                      })
                    }
                  >
                    <option value="swing">疯狂荡秋千</option>
                    <option value="mirror">镜像暴走</option>
                    <option value="lash">左右狂甩</option>
                    <option value="text">安静文字提醒</option>
                  </select>
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={pref.chaseEnabled}
                    onChange={(e) =>
                      change({ ...pref, chaseEnabled: e.target.checked })
                    }
                  />{" "}
                  超时后由当前搭子镜像追逐，直到安静或完成
                </label>
              </section>
            </div>{" "}
            <details>
              <summary>高级提醒设置</summary>
              {(
                [
                  ["重复提醒间隔（秒）", "interval", 10, 3600],
                  ["单次临期动作（秒）", "nearSeconds", 1, 60],
                ] as const
              ).map(([label, k, min, max]) => (
                <label className="field" key={k}>
                  {label}
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={pref[k]}
                    onChange={(e) => change({ ...pref, [k]: +e.target.value })}
                  />
                </label>
              ))}
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={pref.allMembers}
                  onChange={(e) =>
                    change({ ...pref, allMembers: e.target.checked })
                  }
                />{" "}
                临期全员一起动作
              </label>
              <p>
                提前多久提醒在便签架设置中调整；默认 5
                分钟。安静和减少动画会暂停自动动作。
              </p>
            </details>
          </div>
        </div>
      </div>
      <div className="editor-save">
        <button
          className="button"
          disabled={!draft || saved.saving}
          onClick={() => {
            setDraft(null);
            setError("");
            setNotice("已恢复最后成功版本");
          }}
        >
          取消修改
        </button>
        <button
          className="button primary"
          disabled={!draft || saved.saving || !saved.ready}
          onClick={async () => {
            try {
              setError("");
              const removed = saved.state.members.filter(
                (m) => !pref.members.some((n) => n.id === m.id),
              );
              for (const m of removed)
                await dispatchLaundry({ type: "unassign", id: m.id });
              await saveCompanions(pref);
              setDraft(null);
              setNotice("已保存并上架");
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "保存失败，请重试；上次成功版本仍可使用",
              );
            }
          }}
        >
          保存并上架
        </button>
      </div>
      <p className="muted">
        网页可预览页面内追逐，Windows 挂件支持跨应用提醒。
      </p>
      {confirmAction && (
        <Modal
          title={
            confirmAction === "restore"
              ? "恢复搭子备份？"
              : `移除${member?.name}？`
          }
          close={closeConfirm}
        >
          <p>
            {confirmAction === "restore"
              ? "当前内容会另存一份，再恢复最后一次备份。"
              : "保存并上架后生效。关联便签会使用默认搭子，原照片会保留。"}
          </p>
          <div className="modal-actions">
            <button className="button" onClick={closeConfirm}>
              取消
            </button>
            <button
              className="button primary"
              onClick={() => {
                closeConfirm();
                if (confirmAction === "restore") {
                  void restoreCompanionBackup()
                    .then(() => {
                      setDraft(null);
                      setError("");
                    })
                    .catch((e) => setError(e.message));
                } else if (member) {
                  const members = pref.members.filter(
                    (m) => m.id !== member.id,
                  );
                  change({
                    ...pref,
                    members,
                    currentId:
                      pref.currentId === member.id
                        ? members[0]?.id || ""
                        : pref.currentId,
                    displayedIds: pref.displayedIds.filter(
                      (id) => id !== member.id,
                    ),
                  });
                  setSelected("");
                }
              }}
            >
              {confirmAction === "restore" ? "确认恢复" : "确认移除"}
            </button>
          </div>
        </Modal>
      )}
      {editor && member && (
        <PhotoEditor
          member={member}
          close={closeEditor}
          save={(m) => {
            update(m);
            setEditor(false);
          }}
        />
      )}
    </section>
  );
}
