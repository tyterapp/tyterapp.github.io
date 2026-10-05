# Публикация веб-версии Tyter

Текущий MVP работает целиком на GitHub Pages. GitHub Actions получает список из существующего repository secret **TYTER_PRO_CODES** репозитория **tyterapp/tyterapp.github.io** и публикует хеши в https://tyterapp.github.io/codes-for-pro.txt. Исходные коды и email не публикуются. После изменения секрета нужно запустить workflow заново.

Для вашей распакованной папки D:/Tyter/publication/tyterapp.github.io следуйте [пошаговой инструкции повторной публикации через Git Bash](GITHUB_PAGES_UPDATE.md). Дополнительные сведения: [GitHub Pages MVP](GITHUB_PAGES_MVP.md).

Установщики в рамках этого изменения не обновляются.
