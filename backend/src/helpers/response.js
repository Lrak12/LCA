export const sendSuccess = (res, data, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

export const sendError = (res, message = "An error occurred", statusCode = 500) => {
  return res.status(statusCode).json({ success: false, message });
};

export const sendCreated = (res, data, message = "Created successfully") => {
  return sendSuccess(res, data, message, 201);
};
