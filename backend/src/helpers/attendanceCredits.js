export const attendanceCredits = (status) => {
  const normalized = String(status ?? "").toLowerCase();
  const isTardy = normalized === "late" || normalized === "tardy";
  return {
    present: ["present", "excused"].includes(normalized) || isTardy ? 0.5 : 0,
    absent: normalized === "absent" ? 1 : 0,
    tardy: isTardy ? 0.5 : 0,
    excused: normalized === "excused" ? 0.5 : 0,
  };
};

export const addAttendanceCredits = (bucket, status) => {
  const credit = attendanceCredits(status);
  bucket.present += credit.present;
  bucket.absent += credit.absent;
  bucket.tardy += credit.tardy;
  if (Object.hasOwn(bucket, "excused")) bucket.excused += credit.excused;
  return bucket;
};
