export function storageError(value: unknown): Error {
  if (value instanceof DOMException && value.name === "QuotaExceededError")
    return Error(
      "本机存储空间不足，保存失败。请释放空间后重试；上次成功版本仍然保留。",
    );
  return value instanceof Error
    ? value
    : Error("本机保存失败，请重试或恢复备份");
}
