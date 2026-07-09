import { useState, useEffect } from "react";
import { fetchSettingsOverview } from "../api/settings.js";

export function useSchoolYear() {
  const [schoolYearLabel, setSchoolYearLabel] = useState("—");

  useEffect(() => {
    fetchSettingsOverview()
      .then((res) => {
        const sy = res.data.schoolYear;
        if (sy) setSchoolYearLabel(sy.year_label || "—");
      })
      .catch(() => setSchoolYearLabel("—"));
  }, []);

  return schoolYearLabel;
}