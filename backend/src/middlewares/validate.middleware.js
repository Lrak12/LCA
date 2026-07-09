import { validationResult } from "express-validator";
import { sendError } from "../helpers/response.js";

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg).join(", ");
    return sendError(res, messages, 422);
  }
  next();
};

export default validate;
