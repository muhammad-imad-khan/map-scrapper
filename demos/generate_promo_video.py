from pathlib import Path
from typing import Tuple
import io
import tempfile
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from moviepy import ColorClip, CompositeVideoClip, ImageClip, VideoFileClip, AudioFileClip, concatenate_videoclips, vfx
from gtts import gTTS


ROOT = Path(__file__).resolve().parent
OUT_FILE = ROOT / "map-scraper-promo.mp4"
RESOLUTION: Tuple[int, int] = (1080, 1920)
FPS = 30


def get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path("C:/Windows/Fonts/segoeui.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("C:/Windows/Fonts/calibri.ttf"),
    ]
    for font_path in candidates:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size=size)
    return ImageFont.load_default()


def generate_audio(text: str, duration: float) -> AudioFileClip:
    """Generate Hindi TTS audio and pad to specified duration."""
    try:
        tts = gTTS(text=text, lang='hi', slow=False)
        audio_file = os.path.join(tempfile.gettempdir(), f"audio_{int(duration)}.mp3")
        tts.save(audio_file)
        
        audio_clip = AudioFileClip(audio_file)
        actual_duration = audio_clip.duration
        
        if actual_duration < duration:
            audio_clip = audio_clip.with_duration(duration)
        else:
            audio_clip = audio_clip.subclipped(0, duration)
        
        return audio_clip
    except Exception as e:
        print(f"Audio generation error: {e}, skipping audio for this clip")
        return None


def create_girl_image(size: Tuple[int, int] = (300, 400)) -> np.ndarray:
    """Create a simplified illustration of a girl at laptop looking stressed."""
    w, h = size
    img = Image.new("RGBA", (w, h), (240, 240, 245, 255))
    draw = ImageDraw.Draw(img)
    
    # Draw simple laptop
    laptop_w, laptop_h = int(w * 0.7), int(h * 0.4)
    laptop_x, laptop_y = (w - laptop_w) // 2, int(h * 0.5)
    
    # Laptop body
    draw.rectangle(
        [(laptop_x, laptop_y), (laptop_x + laptop_w, laptop_y + laptop_h)],
        fill=(100, 100, 120),
        outline=(50, 50, 70),
        width=2
    )
    
    # Screen
    screen_margin = 8
    draw.rectangle(
        [(laptop_x + screen_margin, laptop_y + screen_margin), 
         (laptop_x + laptop_w - screen_margin, laptop_y + laptop_h - 40)],
        fill=(30, 100, 200),
        outline=(20, 50, 150),
        width=1
    )
    
    # Keyboard
    draw.rectangle(
        [(laptop_x + screen_margin, laptop_y + laptop_h - 35),
         (laptop_x + laptop_w - screen_margin, laptop_y + laptop_h - 5)],
        fill=(80, 80, 90),
        outline=(50, 50, 60),
        width=1
    )
    
    # Simple person head (circle)
    head_y = int(h * 0.15)
    head_size = 35
    draw.ellipse(
        [(w // 2 - head_size, head_y), (w // 2 + head_size, head_y + head_size * 2)],
        fill=(220, 180, 160),
        outline=(180, 140, 120),
        width=1
    )
    
    # Hair
    draw.ellipse(
        [(w // 2 - head_size - 5, head_y - 10), 
         (w // 2 + head_size + 5, head_y + head_size)],
        fill=(60, 20, 0),
    )
    
    # Stressed face - small eyes
    eye_y = head_y + 15
    draw.ellipse([(w // 2 - 20, eye_y), (w // 2 - 10, eye_y + 8)], fill=(0, 0, 0))
    draw.ellipse([(w // 2 + 10, eye_y), (w // 2 + 20, eye_y + 8)], fill=(0, 0, 0))
    
    # Stressed mouth (down curve)
    draw.arc([(w // 2 - 15, eye_y + 15), (w // 2 + 15, eye_y + 35)], 0, 180, fill=(100, 50, 50), width=2)
    
    # Body
    body_y = head_y + head_size * 2
    draw.rectangle(
        [(w // 2 - 25, body_y), (w // 2 + 25, body_y + 60)],
        fill=(220, 100, 100),
        outline=(150, 50, 50),
        width=1
    )
    
    # Arms on keyboard
    draw.rectangle([(w // 2 - 60, body_y + 20), (w // 2 - 25, body_y + 25)], fill=(220, 180, 160))
    draw.rectangle([(w // 2 + 25, body_y + 20), (w // 2 + 60, body_y + 25)], fill=(220, 180, 160))
    
    return np.array(img)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] <= max_width:
            current = candidate
        else:
            if current:
                lines.append(current)
            current = word

    if current:
        lines.append(current)

    return lines


def make_text_panel(
    text: str,
    panel_size: Tuple[int, int],
    font_size: int,
    text_color=(255, 255, 255, 255),
    bg_color=(0, 0, 0, 170),
    padding=28,
) -> np.ndarray:
    panel_w, panel_h = panel_size
    image = Image.new("RGBA", panel_size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    radius = 24
    draw.rounded_rectangle([(0, 0), (panel_w - 1, panel_h - 1)], radius=radius, fill=bg_color)

    font = get_font(font_size)
    lines = wrap_text(draw, text, font, panel_w - 2 * padding)

    line_h = draw.textbbox((0, 0), "Ay", font=font)[3] + 8
    block_h = len(lines) * line_h
    y = max(padding, (panel_h - block_h) // 2)

    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        line_w = bbox[2] - bbox[0]
        x = (panel_w - line_w) // 2
        draw.text((x, y), line, font=font, fill=text_color)
        y += line_h

    return np.array(image)


def build_scene(gif_name: str, title: str, narration: str, duration: float, scene_num: int = 0):
    w, h = RESOLUTION
    gif_path = ROOT / gif_name

    base_bg = ColorClip(size=RESOLUTION, color=(11, 18, 32)).with_duration(duration)

    gif_clip = (
        VideoFileClip(str(gif_path))
        .with_effects([vfx.Loop(duration=duration)])
        .resized(width=940)
        .with_position(("center", 310))
    )

    title_panel = make_text_panel(
        title,
        panel_size=(940, 130),
        font_size=48,
        bg_color=(20, 92, 145, 225),
    )
    title_clip = ImageClip(title_panel).with_duration(duration).with_position(("center", 90))

    body_panel = make_text_panel(
        narration,
        panel_size=(980, 330),
        font_size=42,
        bg_color=(0, 0, 0, 185),
    )
    body_clip = ImageClip(body_panel).with_duration(duration).with_position(("center", 1450))

    scene_clips = [base_bg, gif_clip, title_clip, body_clip]
    
    # Add girl image to Scene 1
    if scene_num == 0:
        girl_img = create_girl_image(size=(280, 380))
        girl_clip = ImageClip(girl_img).with_duration(duration).with_position((60, 380))
        scene_clips.append(girl_clip)
    
    # Add audio
    audio = generate_audio(narration, duration)
    
    scene_video = CompositeVideoClip(scene_clips, size=RESOLUTION).with_duration(duration)
    if audio:
        scene_video = scene_video.with_audio(audio)
    
    return scene_video


def main():
    scenes = [
        (
            "gif-scrape.gif",
            "Hook",
            "Abhi bhi aap web design ya marketing clients manually dhoond rahe hain? Roz naye leads find karna mushkil aur thaka dene wala kaam lagta hai?",
            5,
        ),
        (
            "gif-scrape.gif",
            "Problem",
            "Google Maps par ghanton search karne ke baad bhi data incomplete milta hai. Manual scraping mein aapka bohot saara valuable time waste ho jata hai.",
            5,
        ),
        (
            "gif-viewer.gif",
            "Solution",
            "Isi problem ko solve karne ke liye maine build kiya hai yeh Smart Map Scraper Tool.",
            4.5,
        ),
        (
            "gif-scrape.gif",
            "How it Works",
            "Bas apna keyword enter karein, jaise Restaurants, Salons, ya Real Estate, aur location set karein. Yeh tool automatically saara relevant data extract kar lega.",
            6,
        ),
        (
            "gif-results.gif",
            "Key Features",
            "Aapko milega business name, verified phone numbers, aur websites... sab ek organized sheet mein, ready for outreach.",
            5.5,
        ),
        (
            "gif-results.gif",
            "Value",
            "Ab manual mehnat chhodein aur apni energy sirf deals close karne par focus karein. Kam waqt mein zyada results!",
            4.5,
        ),
        (
            "gif-viewer.gif",
            "Call to Action",
            "Apne business ko scale karne ke liye aaj hi is tool ko try karein. Link bio mein hai!",
            4.5,
        ),
    ]

    clips = [build_scene(scene[0], scene[1], scene[2], scene[3], i) for i, scene in enumerate(scenes)]
    final = concatenate_videoclips(clips, method="compose")

    final.write_videofile(
        str(OUT_FILE),
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        audio=True,
        preset="medium",
        threads=4,
    )

    for clip in clips:
        clip.close()
    final.close()


if __name__ == "__main__":
    main()
