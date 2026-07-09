import * as UserModel from "../models/user.model.js";

export const getAllUsers = async () => {
  const { data, error } = await UserModel.findAll();
  if (error) throw new Error(error.message);
  return data;
};

export const getUserById = async (user_id) => {
  const { data, error } = await UserModel.findById(user_id);
  if (error) throw new Error("User not found");
  return data;
};

export const updateUser = async (user_id, payload) => {
  const { data, error } = await UserModel.update(user_id, payload);
  if (error) throw new Error(error.message);
  return data;
};

export const deactivateUser = async (user_id) => {
  const { data, error } = await UserModel.deactivate(user_id);
  if (error) throw new Error(error.message);
  return data;
};
