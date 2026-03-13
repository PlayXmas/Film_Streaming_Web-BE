import { Op } from "sequelize";
import { Credit, Person, sequelize } from "../models/index.js";
import { deleteUploadFileByUrl } from "../utils/file.util.js";

function normalizeOptionalText(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = String(value).trim();
    return trimmed ? trimmed : null;
}

function normalizeId(value) {
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) return null;
    return id;
}

export const listAdminPeople = async (req, res) => {
    try {
        const pageRaw = parseInt(req.query.page, 10);
        const limitRaw = parseInt(req.query.limit, 10);
        const page = Number.isNaN(pageRaw) || pageRaw < 1 ? 1 : pageRaw;
        const limit = Number.isNaN(limitRaw) || limitRaw < 1 ? 50 : limitRaw;
        const offset = (page - 1) * limit;

        const keyword = String(req.query.keyword || req.query.q || "").trim();
        const where = {};
        if (keyword) {
            const like = `%${keyword}%`;
            where[Op.or] = [
                { name: { [Op.like]: like } },
                { also_known_as: { [Op.like]: like } },
                { description: { [Op.like]: like } },
            ];
        }

        const { rows, count } = await Person.findAndCountAll({
            where,
            order: [
                ["updated_at", "DESC"],
                ["id", "DESC"],
            ],
            limit,
            offset,
        });

        return res.json({
            success: true,
            data: rows,
            pagination: {
                page,
                limit,
                totalItems: count,
                totalPages: Math.max(Math.ceil(count / limit), 1),
            },
        });
    } catch (err) {
        console.error("listAdminPeople error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const getAdminPerson = async (req, res) => {
    try {
        const id = normalizeId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, message: "ID không hợp lệ" });
        }

        const person = await Person.findByPk(id);
        if (!person) {
            return res.status(404).json({ success: false, message: "Không tìm thấy person" });
        }

        const creditStats = await Credit.findAll({
            where: { person_id: id },
            attributes: [
                "credit_type",
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            ],
            group: ["credit_type"],
            raw: true,
        });

        const creditsCount = { cast: 0, crew: 0 };
        for (const row of creditStats) {
            const type = row.credit_type;
            const count = Number(row.count || 0);
            if (type === "cast") creditsCount.cast = count;
            if (type === "crew") creditsCount.crew = count;
        }

        return res.json({
            success: true,
            data: {
                ...person.toJSON(),
                credits_count: creditsCount,
            },
        });
    } catch (err) {
        console.error("getAdminPerson error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const createAdminPerson = async (req, res) => {
    try {
        const {
            name,
            description,
            also_known_as,
            alsoKnownAs,
            avatar_url,
            avatarUrl,
        } = req.body || {};

        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: "Thiếu tên person" });
        }

        const created = await Person.create({
            name: String(name).trim(),
            description: normalizeOptionalText(description),
            also_known_as: normalizeOptionalText(also_known_as ?? alsoKnownAs),
            avatar_url: normalizeOptionalText(avatar_url ?? avatarUrl),
        });

        return res.status(201).json({ success: true, data: created });
    } catch (err) {
        console.error("createAdminPerson error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const updateAdminPerson = async (req, res) => {
    try {
        const id = normalizeId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, message: "ID không hợp lệ" });
        }

        const person = await Person.findByPk(id);
        if (!person) {
            return res.status(404).json({ success: false, message: "Không tìm thấy person" });
        }

        const {
            name,
            description,
            also_known_as,
            alsoKnownAs,
            avatar_url,
            avatarUrl,
        } = req.body || {};

        const payload = {};

        if (name !== undefined) {
            const trimmed = String(name).trim();
            if (!trimmed) {
                return res.status(400).json({ success: false, message: "Tên person không hợp lệ" });
            }
            payload.name = trimmed;
        }

        if (description !== undefined) {
            payload.description = normalizeOptionalText(description);
        }

        if (also_known_as !== undefined || alsoKnownAs !== undefined) {
            payload.also_known_as = normalizeOptionalText(also_known_as ?? alsoKnownAs);
        }

        if (avatar_url !== undefined || avatarUrl !== undefined) {
            payload.avatar_url = normalizeOptionalText(avatar_url ?? avatarUrl);
        }

        if (Object.keys(payload).length === 0) {
            return res.status(400).json({ success: false, message: "Không có dữ liệu cập nhật" });
        }

        await person.update(payload);
        return res.json({ success: true, data: person });
    } catch (err) {
        console.error("updateAdminPerson error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const deleteAdminPerson = async (req, res) => {
    try {
        const id = normalizeId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, message: "ID không hợp lệ" });
        }

        const person = await Person.findByPk(id);
        if (!person) {
            return res.status(404).json({ success: false, message: "Không tìm thấy person" });
        }

        await Credit.destroy({ where: { person_id: id } });
        await person.destroy();

        return res.json({ success: true, message: "Đã xóa person" });
    } catch (err) {
        console.error("deleteAdminPerson error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server" });
    }
};

export const uploadAdminPersonAvatar = async (req, res) => {
    try {
        const id = normalizeId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, message: "ID không hợp lệ" });
        }

        const person = await Person.findByPk(id);
        if (!person) {
            return res.status(404).json({ success: false, message: "Không tìm thấy person" });
        }

        if (!req.file) {
            return res.status(400).json({ success: false, message: "Chưa chọn file ảnh" });
        }

        const oldAvatarUrl = person.avatar_url;
        const avatarUrl = `/uploads/people/${req.file.filename}`;
        person.avatar_url = avatarUrl;
        await person.save();

        if (oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
            deleteUploadFileByUrl(oldAvatarUrl).catch((err) => {
                console.warn("delete old person avatar failed:", err);
            });
        }

        return res.json({
            success: true,
            message: "Cập nhật avatar person thành công",
            data: person,
        });
    } catch (err) {
        console.error("uploadAdminPersonAvatar error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi upload avatar" });
    }
};

export const deleteAdminPersonAvatar = async (req, res) => {
    try {
        const id = normalizeId(req.params.id);
        if (!id) {
            return res.status(400).json({ success: false, message: "ID không hợp lệ" });
        }

        const person = await Person.findByPk(id);
        if (!person) {
            return res.status(404).json({ success: false, message: "Không tìm thấy person" });
        }

        const oldAvatarUrl = person.avatar_url;
        if (!oldAvatarUrl) {
            return res.status(400).json({ success: false, message: "Person chưa có avatar" });
        }

        person.avatar_url = null;
        await person.save();

        deleteUploadFileByUrl(oldAvatarUrl).catch((err) => {
            console.warn("delete person avatar file failed:", err);
        });

        return res.json({
            success: true,
            message: "Đã xóa avatar person",
            data: person,
        });
    } catch (err) {
        console.error("deleteAdminPersonAvatar error:", err);
        return res.status(500).json({ success: false, message: "Lỗi server khi xóa avatar" });
    }
};
