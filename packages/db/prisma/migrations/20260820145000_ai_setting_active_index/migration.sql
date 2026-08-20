-- Ensure only one active AiTranslationSetting at any time.
CREATE UNIQUE INDEX "AiTranslationSetting_active_key" ON "AiTranslationSetting" ("active") WHERE "active" = true;
