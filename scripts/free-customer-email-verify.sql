-- After freeing AdminUsers: also free Customer.Email for that (or any) leftover match.
-- Paste into Azure Query editor and Run.

DECLARE @email nvarchar(256) = N'info@socmed.io';
DECLARE @suffix nvarchar(64) = CONVERT(nvarchar(36), NEWID());

-- 1) Any leftover Customer rows with this email
UPDATE Customers
SET Email = N'released.' + @suffix + N'.' + Email,
    UpdatedAt = SYSUTCDATETIME()
WHERE LOWER(Email) = LOWER(@email);

-- 2) Customer rows linked to AdminUsers we already renamed away from this email
UPDATE c
SET Email = N'released.' + @suffix + N'.cust.' + c.Email,
    UpdatedAt = SYSUTCDATETIME()
FROM Customers c
INNER JOIN AdminUsers u ON u.Id = c.UserId
WHERE u.Email LIKE N'released.%.' + @email
  AND LOWER(c.Email) = LOWER(@email);

-- 3) Verify the address is free
SELECT 'AdminUsers' AS [Table], Email FROM AdminUsers WHERE LOWER(Email) = LOWER(@email) OR Email LIKE N'%' + @email;
SELECT 'Customers' AS [Table], Email, PhoneNumber FROM Customers WHERE LOWER(Email) = LOWER(@email) OR Email LIKE N'%' + @email;
