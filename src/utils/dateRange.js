const MS_PER_DAY = 86400000;

export function isValidISODate(value) {
    if (typeof value !== "string") return false;
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return false;

    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() + 1 === month &&
        date.getUTCDate() === day
    );
}

export function parseISODate(value) {
    if (!isValidISODate(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

export function formatISODate(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function addDays(isoDate, delta) {
    const date = parseISODate(isoDate);
    if (!date) return null;
    date.setUTCDate(date.getUTCDate() + delta);
    return formatISODate(date);
}

export function daysBetween(from, to) {
    const fromDate = parseISODate(from);
    const toDate = parseISODate(to);
    if (!fromDate || !toDate) return null;
    return Math.floor((toDate - fromDate) / MS_PER_DAY) + 1;
}
