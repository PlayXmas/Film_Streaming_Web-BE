export const REPORT_STATUS_VALUES = ["open", "processing", "closed"];
export const REPORT_PENDING_STATUSES = ["open", "processing"];
export const REPORT_RESOLUTION_VALUES = ["resolved", "dismissed"];
export const PLAYBACK_SCOPE_TYPES = ["title", "episode"];

export const REVIEW_REPORT_REASON_OPTIONS = [
    { value: "spam", label: "Spam / quảng cáo", requires_note: false },
    { value: "abuse", label: "Công kích / xúc phạm", requires_note: false },
    { value: "hate_speech", label: "Ngôn từ thù ghét", requires_note: false },
    { value: "spoiler", label: "Tiết lộ nội dung", requires_note: false },
    { value: "other", label: "Khác", requires_note: true },
];

export const PLAYBACK_REPORT_REASON_OPTIONS = [
    { value: "video_not_playing", label: "Video không phát được", requires_note: false },
    { value: "wrong_video", label: "Sai video", requires_note: false },
    { value: "audio_error", label: "Lỗi âm thanh", requires_note: false },
    { value: "subtitle_error", label: "Lỗi phụ đề", requires_note: false },
    { value: "quality_issue", label: "Chất lượng kém", requires_note: false },
    { value: "wrong_episode", label: "Sai tập", requires_note: false },
    { value: "other", label: "Khác", requires_note: true },
];

export const REVIEW_REPORT_REASONS = new Set(
    REVIEW_REPORT_REASON_OPTIONS.map((option) => option.value)
);

export const PLAYBACK_REPORT_REASONS = new Set(
    PLAYBACK_REPORT_REASON_OPTIONS.map((option) => option.value)
);

const REPORT_REASON_LABELS = new Map(
    [...REVIEW_REPORT_REASON_OPTIONS, ...PLAYBACK_REPORT_REASON_OPTIONS].map((option) => [
        option.value,
        option.label,
    ])
);

const REPORT_STATUS_LABELS = new Map([
    ["open", "Chờ xử lý"],
    ["processing", "Đang xử lý"],
    ["resolved", "Đã xử lý"],
    ["dismissed", "Bỏ qua"],
    ["closed", "Đã đóng"],
]);

export function getReportReasonLabel(reason) {
    return REPORT_REASON_LABELS.get(reason) || reason;
}

export function getReportStatusLabel(status, resolution = null) {
    if (status === "closed" && resolution) {
        return REPORT_STATUS_LABELS.get(resolution) || resolution;
    }
    return REPORT_STATUS_LABELS.get(status) || status;
}
