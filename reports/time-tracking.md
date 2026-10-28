# زمان‌سنجی — انسان و ماشین

## ساعات انسانی (Human Time)

| فعالیت | ساعت | تاریخ | توضیحات |
|--------|------|-------|----------|
| استخراج داده‌های محلی | ۱.۰ | ۲۰۲۶-۱۰-۲۶ | LLfs, داشبورد, لاگ‌ها |
| پژوهش وب | ۱.۵ | ۲۰۲۶-۱۰-۲۶ | ویکی‌پدیا |
| تالیف HTML گزارش | ۱.۵ | ۲۰۲۶-۱۰-۲۶ | ۲۴ اسلاید، فارسی، RTL |
| بررسی و تصحیح | ۰.۵ | ۲۰۲۶-۱۰-۲۶ | منابع, ساختار |
| **جمع** | **۴.۵ ساعت** | | |

## زمان ماشینی (Machine Time)

| عملیات | مدت | منبع | توضیح |
|--------|-----|------|--------|
| sync_chats | متغیر | scripts/sync_chats.py |tokens per sync |
| migrate mimocode | متغیر | scripts/migrate_mimocode_to_postgres.py | ۳۰+ جدول |
| API retry loops | ≤۱۲s max | multiple scripts | backoff logic |
| Timeline generation | متغیر | generate-monthly-timeline.py | Oct 2026 |

## کدهای صرفه‌جویی (Efficiency Benchmarks)

| شاخص | مقدار |
|------|-------|
| Tokens در free tier | ۱۰۰ در ماه |
| هزینه انسانی | ۴.۵ ساعت |
| هزینه دیتابیس | صفر |
| token استفاده شده ( estimations) | ~۵,۰۰۰ |

