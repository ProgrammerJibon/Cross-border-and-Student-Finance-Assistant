import { z } from "zod";
import countries from "world-countries";
import { shortText, studentStatus } from "./validation";
const country = shortText.refine(value => countries.some(c => c.name.common === value), "Select a supported country.");
export const studentProfileSchema = z.object({
  student_status: studentStatus,
  home_country: country,
  study_country: country,
});
export const studentStatusOptions = ["FULL_TIME", "PART_TIME", "PROSPECTIVE", "GRADUATED"].map(value => ({ value, label: value }));
