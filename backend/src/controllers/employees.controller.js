import * as EmployeesService from "../services/employees.service.js";
import { sendSuccess } from "../helpers/response.js";
import asyncHandler from "../helpers/asyncHandler.js";

export const getAll = asyncHandler(async (req, res) => {
  const data = await EmployeesService.getEmployees();
  sendSuccess(res, data);
});

export const getStats = asyncHandler(async (req, res) => {
  const data = await EmployeesService.getEmployeeStats();
  sendSuccess(res, data);
});

export const getSupervisors = asyncHandler(async (req, res) => {
  const data = await EmployeesService.getSupervisors();
  sendSuccess(res, data);
});

export const getSupervisorStats = asyncHandler(async (req, res) => {
  const data = await EmployeesService.getSupervisorStats();
  sendSuccess(res, data);
});

export const createEmployee = async (req, res, next) => {
  try {
    const data = await EmployeesService.createEmployee(req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
};

export const updateSupervisor = asyncHandler(async (req, res) => {
  const data = await EmployeesService.updateSupervisor(req.params.id, req.body);
  sendSuccess(res, data);
});