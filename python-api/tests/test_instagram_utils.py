from main import extract_instagram_shortcode


def test_extract_instagram_shortcode_post():
    url = "https://www.instagram.com/p/ABC123xyz/"
    assert extract_instagram_shortcode(url) == "ABC123xyz"


def test_extract_instagram_shortcode_reel_with_params():
    url = "https://www.instagram.com/reel/abc_123/?igsh=abcd1234"
    assert extract_instagram_shortcode(url) == "abc_123"


def test_extract_instagram_shortcode_invalid():
    url = "https://example.com/recipes/123"
    assert extract_instagram_shortcode(url) is None
