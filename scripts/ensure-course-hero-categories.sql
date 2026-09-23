-- Fix misspelled trending category and ensure hero categories exist.

UPDATE Categories
SET Name = N'Trending Tutorials',
    Description = N'Featured tutorials for the Home hero',
    IsActive = 1,
    SortOrder = 3,
    UpdatedAt = SYSUTCDATETIME()
WHERE LOWER(Name) LIKE 'trending%'
  AND Name <> N'Trending Tutorials';

IF NOT EXISTS (SELECT 1 FROM Categories WHERE Id = '33333333-3333-3333-3333-333333333333'
               OR LOWER(Name) = 'trending tutorials')
BEGIN
  INSERT INTO Categories (Id, Name, Description, SortOrder, IsActive, CreatedAt, UpdatedAt)
  VALUES (
    '33333333-3333-3333-3333-333333333333',
    N'Trending Tutorials',
    N'Featured tutorials for the Home hero',
    3, 1, SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END;

