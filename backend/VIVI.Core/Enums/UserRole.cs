namespace VIVI.Core.Enums;

public enum UserRole
{
    Admin = 1,
    Customer = 2,
    /// <summary>Console operator with day-to-day access; cannot manage team users.</summary>
    Staff = 3
}
