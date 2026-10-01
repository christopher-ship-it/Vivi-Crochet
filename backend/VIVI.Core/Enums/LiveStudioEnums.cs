namespace VIVI.Core.Enums;

public enum LiveSlotType
{
    Morning = 0,
    Evening = 1,
    /// <summary>Optional additional sessions, enabled and named by an admin (LiveSessionDefinition).</summary>
    Extra1 = 2,
    Extra2 = 3,
    Extra3 = 4
}

public enum LiveBookingStatus
{
    PendingPayment = 0,
    Confirmed = 1,
    Cancelled = 2,
    Expired = 3
}

public enum LiveDayKind
{
    Class = 0,
    Off = 1,
    Break = 2,
    Replacement = 3,
    Available = 4
}
