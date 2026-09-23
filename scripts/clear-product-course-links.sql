-- Clear blanket product→course links so shop cards stop showing Learn on every item.
-- Re-link specific products in Admin when needed.

UPDATE Products
SET CourseId = NULL,
    UpdatedAt = SYSUTCDATETIME()
WHERE CourseId IS NOT NULL;

SELECT Name, CourseId FROM Products ORDER BY Name;
