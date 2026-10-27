export const COMMENT_STATUSES = [
  { value: "open", label: "Открыт" },
  { value: "in-progress", label: "В работе" },
  { value: "review", label: "На проверке" },
  { value: "deferred", label: "Отложен" },
  { value: "resolved", label: "Решён" },
];
export const COMMENT_COLORS = [
  { value: "yellow", label: "Жёлтый", hue: 85 },
  { value: "purple", label: "Фиолетовый", hue: 300 },
  { value: "blue", label: "Синий", hue: 250 },
  { value: "green", label: "Зелёный", hue: 150 },
  { value: "red", label: "Красный", hue: 25 },
  { value: "gray", label: "Серый", hue: 0 },
];
export const commentStatus = (comment) =>
  comment.resolved
    ? "resolved"
    : COMMENT_STATUSES.some(
          (status) =>
            status.value === comment.status && status.value !== "resolved",
        )
      ? comment.status
      : "open";
export const commentColor = (comment) =>
  COMMENT_COLORS.find((color) => color.value === comment.color) ||
  COMMENT_COLORS[0];
export const commentStyle = (comment) => {
  const color = commentColor(comment);
  return {
    "--comment-hue": color.hue,
    "--comment-chroma": color.value === "gray" ? 0 : 0.09,
  };
};
export function cleanCommentOptions(comment) {
  const status = COMMENT_STATUSES.some((item) => item.value === comment.status)
    ? comment.status
    : comment.resolved
      ? "resolved"
      : "open";
  return {
    status,
    resolved: status === "resolved",
    color: commentColor(comment).value,
  };
}
