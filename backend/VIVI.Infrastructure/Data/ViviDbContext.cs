using Microsoft.EntityFrameworkCore;
using VIVI.Core.Entities;

namespace VIVI.Infrastructure.Data;

public sealed class ViviDbContext : DbContext
{
    public ViviDbContext(DbContextOptions<ViviDbContext> options) : base(options)
    {
    }

    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Course> Courses => Set<Course>();
    public DbSet<Video> Videos => Set<Video>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductImage> ProductImages => Set<ProductImage>();
    public DbSet<ProductEssentialLink> ProductEssentialLinks => Set<ProductEssentialLink>();
    public DbSet<OtpChallenge> OtpChallenges => Set<OtpChallenge>();
    public DbSet<PasswordResetChallenge> PasswordResetChallenges => Set<PasswordResetChallenge>();
    public DbSet<EmailVerificationChallenge> EmailVerificationChallenges => Set<EmailVerificationChallenge>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<CourseEnrollment> CourseEnrollments => Set<CourseEnrollment>();
    public DbSet<CourseBundleItem> CourseBundleItems => Set<CourseBundleItem>();
    public DbSet<LaunchOfferCounter> LaunchOfferCounters => Set<LaunchOfferCounter>();
    public DbSet<EmailNotification> EmailNotifications => Set<EmailNotification>();
    public DbSet<OrderDeliveryUpdate> OrderDeliveryUpdates => Set<OrderDeliveryUpdate>();
    public DbSet<LiveWeek> LiveWeeks => Set<LiveWeek>();
    public DbSet<LiveWeekSlot> LiveWeekSlots => Set<LiveWeekSlot>();
    public DbSet<LiveBooking> LiveBookings => Set<LiveBooking>();
    public DbSet<SupportInquiry> SupportInquiries => Set<SupportInquiry>();
    public DbSet<DevicePushToken> DevicePushTokens => Set<DevicePushToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AdminUser>(entity =>
        {
            entity.ToTable("AdminUsers");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(256).IsRequired();
            entity.Property(x => x.PasswordHash).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Name).HasMaxLength(120).IsRequired();
            entity.Property(x => x.Role).HasConversion<int>().IsRequired();
            entity.HasIndex(x => x.Email).IsUnique();
        });

        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("Categories");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(400);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.HasIndex(x => x.SortOrder);
        });

        modelBuilder.Entity<Course>(entity =>
        {
            entity.ToTable("Courses");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Type).HasConversion<int>().IsRequired();
            entity.Property(x => x.Level).HasMaxLength(80);
            entity.Property(x => x.Description).HasMaxLength(400);
            entity.Property(x => x.About).HasMaxLength(2000);
            entity.Property(x => x.Languages).HasMaxLength(200);
            entity.Property(x => x.ThumbnailUrl).HasMaxLength(512);
            entity.Property(x => x.SortOrder).IsRequired();
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.CategoryId);
            entity.HasIndex(x => new { x.CategoryId, x.SortOrder });
            entity.HasIndex(x => x.Name);

            entity.HasOne(x => x.Category)
                .WithMany(x => x.Courses)
                .HasForeignKey(x => x.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasOne(x => x.CreatedByUser)
                .WithMany(x => x.CreatedCourses)
                .HasForeignKey(x => x.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Video>(entity =>
        {
            entity.ToTable("Videos");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Title).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(1000);
            entity.Property(x => x.BlobPath).HasMaxLength(512).IsRequired();
            entity.Property(x => x.OriginalBlobPath).HasMaxLength(512).IsRequired();
            entity.Property(x => x.ThumbnailBlobPath).HasMaxLength(512);
            entity.Property(x => x.VideoFileName).HasMaxLength(260).IsRequired();
            entity.Property(x => x.ContentType).HasMaxLength(80).IsRequired();
            entity.Property(x => x.PlayableContentType).HasMaxLength(80);
            entity.Property(x => x.TranscodeStatus).HasConversion<int>().IsRequired();
            entity.Property(x => x.TranscodeError).HasMaxLength(1000);
            entity.Property(x => x.PatternPdfBlobPath).HasMaxLength(512);
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.TranscodeStatus);
            entity.HasIndex(x => new { x.CourseId, x.SortOrder });
            entity.HasIndex(x => x.BlobPath).IsUnique();

            entity.HasOne(x => x.Course)
                .WithMany(x => x.Videos)
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.CreatedByUser)
                .WithMany(x => x.CreatedVideos)
                .HasForeignKey(x => x.CreatedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("Products");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasMaxLength(160).IsRequired();
            entity.Property(x => x.Category).HasMaxLength(80).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(2000);
            entity.Property(x => x.ImageUrl).HasMaxLength(512);
            entity.Property(x => x.Spec1).HasMaxLength(120);
            entity.Property(x => x.Spec2).HasMaxLength(120);
            entity.Property(x => x.ProductType).HasConversion<int>().IsRequired();
            entity.Property(x => x.AvailableStock).IsRequired();
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.Category);
            entity.HasIndex(x => x.ProductType);
            entity.HasIndex(x => x.SortOrder);

            entity.HasOne(x => x.Course)
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<ProductImage>(entity =>
        {
            entity.ToTable("ProductImages");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.BlobPath).HasMaxLength(512).IsRequired();
            entity.HasIndex(x => x.ProductId);
            entity.HasIndex(x => new { x.ProductId, x.IsMain });
            entity.HasIndex(x => new { x.ProductId, x.SortOrder });

            entity.HasOne(x => x.Product)
                .WithMany(x => x.Images)
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProductEssentialLink>(entity =>
        {
            entity.ToTable("ProductEssentialLinks");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.SourceProductId, x.EssentialProductId }).IsUnique();
            entity.HasIndex(x => new { x.SourceProductId, x.SortOrder });

            entity.HasOne(x => x.SourceProduct)
                .WithMany(x => x.EssentialLinks)
                .HasForeignKey(x => x.SourceProductId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.EssentialProduct)
                .WithMany()
                .HasForeignKey(x => x.EssentialProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OtpChallenge>(entity =>
        {
            entity.ToTable("OtpChallenges");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Phone).HasMaxLength(10).IsRequired();
            entity.Property(x => x.ProviderSessionId).HasMaxLength(120).IsRequired();
            entity.HasIndex(x => x.Phone);
            entity.HasIndex(x => x.ExpiresAt);
        });

        modelBuilder.Entity<PasswordResetChallenge>(entity =>
        {
            entity.ToTable("PasswordResetChallenges");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(256).IsRequired();
            entity.Property(x => x.CodeHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(x => x.Email);
            entity.HasIndex(x => x.ExpiresAt);
        });

        modelBuilder.Entity<EmailVerificationChallenge>(entity =>
        {
            entity.ToTable("EmailVerificationChallenges");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Email).HasMaxLength(256).IsRequired();
            entity.Property(x => x.CodeHash).HasMaxLength(64).IsRequired();
            entity.HasIndex(x => x.CustomerId);
            entity.HasIndex(x => x.Email);
            entity.HasIndex(x => x.ExpiresAt);
            entity.HasOne(x => x.Customer)
                .WithMany()
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Customer>(entity =>
        {
            entity.ToTable("Customers");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.FullName).HasMaxLength(120).IsRequired();
            entity.Property(x => x.PhoneNumber).HasMaxLength(20);
            entity.Property(x => x.Email).HasMaxLength(256).IsRequired();
            entity.Property(x => x.Country).HasMaxLength(80);
            entity.Property(x => x.State).HasMaxLength(80);
            entity.Property(x => x.City).HasMaxLength(80);
            entity.Property(x => x.AuthMethod).HasConversion<int>().IsRequired();
            entity.Property(x => x.ShipFullName).HasMaxLength(120);
            entity.Property(x => x.ShipPhone).HasMaxLength(20);
            entity.Property(x => x.ShipAddressLine1).HasMaxLength(200);
            entity.Property(x => x.ShipAddressLine2).HasMaxLength(200);
            entity.Property(x => x.ShipLandmark).HasMaxLength(120);
            entity.Property(x => x.ShipAddressTag).HasMaxLength(40);
            entity.Property(x => x.ShipCity).HasMaxLength(80);
            entity.Property(x => x.ShipState).HasMaxLength(80);
            entity.Property(x => x.ShipPinCode).HasMaxLength(12);
            entity.Property(x => x.ShipCountry).HasMaxLength(80);
            entity.HasIndex(x => x.PhoneNumber)
                .IsUnique()
                .HasFilter("[PhoneNumber] IS NOT NULL");
            entity.HasIndex(x => x.UserId).IsUnique();
            entity.HasIndex(x => x.Email).IsUnique();

            entity.HasOne(x => x.User)
                .WithOne(x => x.CustomerProfile)
                .HasForeignKey<Customer>(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DevicePushToken>(entity =>
        {
            entity.ToTable("DevicePushTokens");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.ExpoPushToken).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Platform).HasMaxLength(20).IsRequired();
            entity.HasIndex(x => x.ExpoPushToken).IsUnique();
            entity.HasIndex(x => x.CustomerId);
            entity.HasOne(x => x.Customer)
                .WithMany(c => c.DevicePushTokens)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("Orders");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.OrderNumber).HasMaxLength(32).IsRequired();
            entity.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            entity.Property(x => x.RazorpayOrderId).HasMaxLength(64);
            entity.Property(x => x.Subtotal).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.TaxAmount).HasPrecision(18, 2);
            entity.Property(x => x.ShippingAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.Property(x => x.InventoryDeducted).IsRequired();
            entity.Property(x => x.ShipFullName).HasMaxLength(120);
            entity.Property(x => x.ShipPhone).HasMaxLength(20);
            entity.Property(x => x.ShipAddressLine1).HasMaxLength(200);
            entity.Property(x => x.ShipAddressLine2).HasMaxLength(200);
            entity.Property(x => x.ShipLandmark).HasMaxLength(120);
            entity.Property(x => x.ShipCity).HasMaxLength(80);
            entity.Property(x => x.ShipState).HasMaxLength(80);
            entity.Property(x => x.ShipPinCode).HasMaxLength(12);
            entity.Property(x => x.ShipCountry).HasMaxLength(80);
            entity.Property(x => x.DeliveryDateOverrideReason).HasMaxLength(400);
            entity.HasIndex(x => x.OrderNumber).IsUnique();
            entity.HasIndex(x => x.RazorpayOrderId).IsUnique().HasFilter("[RazorpayOrderId] IS NOT NULL");
            entity.HasIndex(x => x.CustomerId);
            entity.HasIndex(x => x.Status);

            entity.HasOne(x => x.Customer)
                .WithMany(x => x.Orders)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.DeliveryDateOverriddenByUser)
                .WithMany()
                .HasForeignKey(x => x.DeliveryDateOverriddenBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderDeliveryUpdate>(entity =>
        {
            entity.ToTable("OrderDeliveryUpdates");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Reason).HasMaxLength(400);
            entity.HasIndex(x => x.OrderId);
            entity.HasIndex(x => x.ChangedAt);

            entity.HasOne(x => x.Order)
                .WithMany(x => x.DeliveryUpdates)
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.ChangedByUser)
                .WithMany()
                .HasForeignKey(x => x.ChangedBy)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<OrderItem>(entity =>
        {
            entity.ToTable("OrderItems");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.ItemType).HasConversion<int>().IsRequired();
            entity.Property(x => x.UnitPrice).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.ItemNameSnapshot).HasMaxLength(200).IsRequired();
            entity.HasIndex(x => x.OrderId);

            entity.HasOne(x => x.Order)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.Product)
                .WithMany()
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Course)
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.Property(x => x.LiveSlotType).HasConversion<int?>();
            entity.HasIndex(x => x.LiveWeekId);
        });

        modelBuilder.Entity<LiveWeek>(entity =>
        {
            entity.ToTable("LiveWeeks");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.BreakWeekday).HasConversion<int?>();
            entity.Property(x => x.TutorName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.TutorPhotoBlobPath).HasMaxLength(500);
            entity.HasIndex(x => new { x.SeasonYear, x.WeekNumber }).IsUnique();
            entity.HasIndex(x => x.StartDate);
        });

        modelBuilder.Entity<LiveWeekSlot>(entity =>
        {
            entity.ToTable("LiveWeekSlots");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.SlotType).HasConversion<int>().IsRequired();
            entity.HasIndex(x => new { x.LiveWeekId, x.SlotType }).IsUnique();
            entity.Property(x => x.SeatsBooked).IsConcurrencyToken();
            entity.HasOne(x => x.Week)
                .WithMany(w => w.Slots)
                .HasForeignKey(x => x.LiveWeekId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LiveBooking>(entity =>
        {
            entity.ToTable("LiveBookings");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.SlotType).HasConversion<int>().IsRequired();
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.HasIndex(x => new { x.CustomerId, x.LiveWeekId, x.SlotType });
            entity.HasIndex(x => x.OrderId).IsUnique();
            entity.HasOne(x => x.Customer)
                .WithMany()
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Week)
                .WithMany(w => w.Bookings)
                .HasForeignKey(x => x.LiveWeekId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.Order)
                .WithMany()
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.OrderItem)
                .WithMany()
                .HasForeignKey(x => x.OrderItemId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("Payments");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Provider).HasConversion<int>().IsRequired();
            entity.Property(x => x.ProviderOrderId).HasMaxLength(64).IsRequired();
            entity.Property(x => x.ProviderPaymentId).HasMaxLength(64);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.Property(x => x.Currency).HasMaxLength(3).IsRequired();
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.HasIndex(x => x.OrderId);
            entity.HasIndex(x => x.ProviderPaymentId).IsUnique().HasFilter("[ProviderPaymentId] IS NOT NULL");
            entity.HasIndex(x => x.ProviderOrderId);

            entity.HasOne(x => x.Order)
                .WithMany(x => x.Payments)
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CourseEnrollment>(entity =>
        {
            entity.ToTable("CourseEnrollments");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.CustomerId, x.CourseId, x.OrderItemId }).IsUnique();
            entity.HasIndex(x => new { x.CustomerId, x.CourseId });
            entity.HasIndex(x => x.AccessExpiryDate);

            entity.HasOne(x => x.Customer)
                .WithMany(x => x.Enrollments)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Course)
                .WithMany()
                .HasForeignKey(x => x.CourseId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.Order)
                .WithMany()
                .HasForeignKey(x => x.OrderId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(x => x.OrderItem)
                .WithMany(x => x.Enrollments)
                .HasForeignKey(x => x.OrderItemId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<CourseBundleItem>(entity =>
        {
            entity.ToTable("CourseBundleItems");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.BundleCourseId, x.IncludedCourseId }).IsUnique();
            entity.HasIndex(x => x.BundleCourseId);

            entity.HasOne(x => x.BundleCourse)
                .WithMany(x => x.BundleItems)
                .HasForeignKey(x => x.BundleCourseId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(x => x.IncludedCourse)
                .WithMany(x => x.IncludedInBundles)
                .HasForeignKey(x => x.IncludedCourseId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<LaunchOfferCounter>(entity =>
        {
            entity.ToTable("LaunchOfferCounters");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.CourseId).IsUnique();

            entity.HasOne(x => x.Course)
                .WithOne(x => x.LaunchOffer)
                .HasForeignKey<LaunchOfferCounter>(x => x.CourseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<EmailNotification>(entity =>
        {
            entity.ToTable("EmailNotifications");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.IdempotencyKey).HasMaxLength(120).IsRequired();
            entity.Property(x => x.RecipientEmail).HasMaxLength(256).IsRequired();
            entity.Property(x => x.Subject).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ProviderMessageId).HasMaxLength(120);
            entity.Property(x => x.LastError).HasMaxLength(1000);
            entity.Property(x => x.Type).HasConversion<int>().IsRequired();
            entity.Property(x => x.Status).HasConversion<int>().IsRequired();
            entity.HasIndex(x => x.IdempotencyKey).IsUnique();
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.OrderId);
            entity.HasIndex(x => x.CourseEnrollmentId);
        });

        modelBuilder.Entity<SupportInquiry>(entity =>
        {
            entity.ToTable("SupportInquiries");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Message).HasMaxLength(2000).IsRequired();
            entity.Property(x => x.IsRead).IsRequired();
            entity.HasIndex(x => x.CustomerId);
            entity.HasIndex(x => x.CreatedAt);
            entity.HasIndex(x => x.IsRead);

            entity.HasOne(x => x.Customer)
                .WithMany(x => x.SupportInquiries)
                .HasForeignKey(x => x.CustomerId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
