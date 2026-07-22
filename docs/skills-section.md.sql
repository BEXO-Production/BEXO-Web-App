-- Skills section uses existing profile_sections rows with type = 'skills'.
-- No DDL required; unique (profile_id, type) already enforces one skills row per profile.
-- Entry shape (jsonb): { "id": "1", "name": "React", "category": "technical" }
-- Categories: technical | tools | soft | languages
-- Soft cap of 40 entries enforced in API.

SELECT 'skills_section_is_app_level_no_ddl' AS note;
