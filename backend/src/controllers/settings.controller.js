import * as S from "../services/settings.service.js";

export const getOverview      = async (req, res, next) => { try { res.json({ success: true, data: await S.getSettingsOverview() }); } catch (e) { next(e); } };
export const getAcademicConfig = async (req, res, next) => { try { res.json({ success: true, data: await S.getAcademicConfig() }); } catch (e) { next(e); } };
export const addGradeLevel    = async (req, res, next) => { try { res.status(201).json({ success: true, data: await S.addGradeLevel(req.body) }); } catch (e) { next(e); } };
export const editGradeLevel   = async (req, res, next) => { try { res.json({ success: true, data: await S.editGradeLevel(req.params.id, req.body) }); } catch (e) { next(e); } };
export const removeGradeLevel = async (req, res, next) => { try { await S.removeGradeLevel(req.params.id); res.json({ success: true }); } catch (e) { next(e); } };


export const updateSchoolYear = async (req, res, next) => {
  try {
    res.json({ success: true, data: await S.updateSchoolYear(req.body) });
  } catch (e) { next(e); }
};