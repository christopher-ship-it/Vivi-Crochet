using VIVI.Core;
using Xunit;

namespace VIVI.Api.Tests;

public class ProductThumbPathTests
{
    [Fact]
    public void Thumb_path_sits_in_thumb_folder_beside_the_photo_and_stays_owned()
    {
        var id = Guid.NewGuid();
        var photo = ImageFileRules.BuildBlobPath(id, "abc-rose.png");

        var thumb = ImageFileRules.BuildThumbBlobPath(photo);

        Assert.Equal($"products/{id:D}/image/thumb/abc-rose.webp", thumb);
        Assert.True(ImageFileRules.IsOwnedBlobPath(id, thumb));
    }
}
