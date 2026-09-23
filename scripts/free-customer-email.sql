-- Free info@socmed.io (or any email) for re-registration without deleting order history.
-- Run in Azure Portal → SQL database → Query editor, or SSMS.
--
-- Replace the email below if needed.

DECLARE @email nvarchar(256) = N'info@socmed.io';
DECLARE @suffix nvarchar(64) = CONVERT(nvarchar(36), NEWID());

UPDATE AdminUsers
SET Email = N'released.' + @suffix + N'.' + Email,
    UpdatedAt = SYSUTCDATETIME()
WHERE LOWER(Email) = LOWER(@email);

UPDATE Customers
SET Email = N'released.' + @suffix + N'.' + Email,
    UpdatedAt = SYSUTCDATETIME()
WHERE LOWER(Email) = LOWER(@email);

SELECT
    (SELECT COUNT(*) FROM AdminUsers WHERE Email LIKE N'released.%' AND Email LIKE N'%' + @email) AS FreedUsers,
    (SELECT COUNT(*) FROM Customers WHERE Email LIKE N'released.%' AND Email LIKE N'%' + @email) AS FreedCustomers;
