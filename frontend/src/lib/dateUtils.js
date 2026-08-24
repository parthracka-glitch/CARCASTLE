/**
 * Date and day calculation utilities for Car Castle Goa.
 * 
 * 9AM–9:30AM Rule:
 * - A booking day runs from 09:00 AM to the next 09:00 AM.
 * - If the car is returned after 09:30 AM on the return day (e.g. 09:35, 11:00, 14:00),
 *   automatically charge one additional full day (T+1).
 * - Minimum duration is 1 day.
 */

export function calculateRentalDays(startDate, endDate, pickupTime = "09:00", dropTime = "09:00") {
  if (!startDate || !endDate) return 1;

  try {
    const sDateStr = String(startDate).slice(0, 10);
    const eDateStr = String(endDate).slice(0, 10);

    const s = new Date(sDateStr + "T00:00:00");
    const e = new Date(eDateStr + "T00:00:00");

    const diffTime = e.getTime() - s.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 1;

    let baseDays = diffDays;
    const dTime = (dropTime || "09:00").trim().slice(0, 5);

    // If returned after 09:30 AM on the return day, add 1 extra full day (T+1)
    if (dTime > "09:30") {
      return baseDays + 1;
    }

    return Math.max(1, baseDays);
  } catch (_err) {
    return 1;
  }
}

export function isDropAfter9AM(dropTime) {
  const t = (dropTime || "09:00").trim().slice(0, 5);
  return t > "09:30";
}

export const isDropAfter930AM = isDropAfter9AM;

export function formatTime12h(time24) {
  if (!time24) return "09:00 AM";
  try {
    const [hStr, mStr] = time24.split(":");
    let h = parseInt(hStr, 10);
    const m = mStr || "00";
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h.toString().padStart(2, "0")}:${m} ${ampm}`;
  } catch (_e) {
    return time24;
  }
}
