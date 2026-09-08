namespace VIVI.Core.Enums;

public enum LiveSlotType
{
    Morning = 0,
    Evening = 1
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
