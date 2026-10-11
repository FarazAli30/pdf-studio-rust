//! Standard-14 Helvetica metrics + WinAnsi encoding (enough for stamps / headers / text->PDF).

use crate::pdfkit::name;
use lopdf::Dictionary;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Font {
    Helvetica,
    HelveticaBold,
    Courier,
}

impl Font {
    pub fn base_font(self) -> &'static str {
        match self {
            Font::Helvetica => "Helvetica",
            Font::HelveticaBold => "Helvetica-Bold",
            Font::Courier => "Courier",
        }
    }

    pub fn dict(self) -> Dictionary {
        let mut d = Dictionary::new();
        d.set("Type", name("Font"));
        d.set("Subtype", name("Type1"));
        d.set("BaseFont", name(self.base_font()));
        d.set("Encoding", name("WinAnsiEncoding"));
        d
    }
}

// Glyph advance widths for ASCII 32..=126 (1000 units / em), from the Adobe AFM files.
const HELV: [u16; 95] = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 48-57
    278, 278, 584, 584, 584, 556, 1015, // 58-64
    667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
    611, 722, 667, 944, 667, 667, 611, // A-Z
    278, 278, 278, 469, 556, 333, // 91-96
    556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
    278, 556, 500, 722, 500, 500, 500, // a-z
    334, 260, 334, 584, // 123-126
];

const HELV_BOLD: [u16; 95] = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, // 32-47
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, // 48-57
    333, 333, 584, 584, 584, 611, 975, // 58-64
    722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
    611, 722, 667, 944, 667, 667, 611, // A-Z
    333, 278, 333, 584, 556, 333, // 91-96
    556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556,
    333, 611, 556, 778, 556, 556, 500, // a-z
    389, 280, 389, 584, // 123-126
];

pub fn char_width(font: Font, c: char) -> f32 {
    let cp = c as u32;
    match font {
        Font::Courier => 600.0,
        Font::Helvetica | Font::HelveticaBold => {
            let table = if font == Font::Helvetica { &HELV } else { &HELV_BOLD };
            if (32..=126).contains(&cp) {
                table[(cp - 32) as usize] as f32
            } else {
                556.0
            }
        }
    }
}

pub fn text_width(font: Font, s: &str, size: f32) -> f32 {
    s.chars().map(|c| char_width(font, c)).sum::<f32>() * size / 1000.0
}

/// Map a unicode char to its WinAnsi byte (best effort, '?' when unrepresentable).
pub fn winansi_byte(c: char) -> u8 {
    let cp = c as u32;
    if cp < 0x80 || (0xA0..=0xFF).contains(&cp) {
        return cp as u8;
    }
    match c {
        '€' => 0x80,
        '‚' => 0x82,
        'ƒ' => 0x83,
        '„' => 0x84,
        '…' => 0x85,
        '†' => 0x86,
        '‡' => 0x87,
        'ˆ' => 0x88,
        '‰' => 0x89,
        'Š' => 0x8A,
        '‹' => 0x8B,
        'Œ' => 0x8C,
        'Ž' => 0x8E,
        '‘' => 0x91,
        '’' => 0x92,
        '“' => 0x93,
        '”' => 0x94,
        '•' => 0x95,
        '–' => 0x96,
        '—' => 0x97,
        '˜' => 0x98,
        '™' => 0x99,
        'š' => 0x9A,
        '›' => 0x9B,
        'œ' => 0x9C,
        'ž' => 0x9E,
        'Ÿ' => 0x9F,
        '\t' => b' ',
        _ => b'?',
    }
}

/// Hex string literal (`<48656C6C6F>`) for a text-showing operator.
pub fn hex_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2 + 2);
    out.push('<');
    for c in s.chars() {
        out.push_str(&format!("{:02X}", winansi_byte(c)));
    }
    out.push('>');
    out
}
