"""
Generate two PDFs:
1. AI Prompts & Pitch Templates (combined course prompt + pitchable prompts)
2. Beginner Setup Tutorial (VS Code, Git, GitHub, Node.js, Vercel)
"""
from fpdf import FPDF
import os

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ═══════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════

class StyledPDF(FPDF):
    """Base PDF with consistent branding."""
    BG = (15, 15, 15)
    GREEN = (34, 197, 94)
    WHITE = (255, 255, 255)
    GRAY = (160, 160, 160)
    DARK_CARD = (28, 28, 28)
    LIGHT_TEXT = (220, 220, 220)
    YELLOW = (250, 204, 21)

    def __init__(self):
        super().__init__()
        self.set_auto_page_break(auto=True, margin=20)

    def cover_page(self, title, subtitle):
        self.add_page()
        self.set_fill_color(*self.BG)
        self.rect(0, 0, 210, 297, 'F')
        # Green accent bar
        self.set_fill_color(*self.GREEN)
        self.rect(0, 0, 210, 6, 'F')
        # Title
        self.set_y(80)
        self.set_font('Helvetica', 'B', 32)
        self.set_text_color(*self.GREEN)
        self.multi_cell(0, 14, title, align='C')
        # Subtitle
        self.ln(8)
        self.set_font('Helvetica', '', 14)
        self.set_text_color(*self.GRAY)
        self.multi_cell(0, 8, subtitle, align='C')
        # Bottom branding
        self.set_y(250)
        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(*self.GREEN)
        self.cell(0, 8, 'Maps Lead Scraper', align='C', new_x='LMARGIN', new_y='NEXT')
        self.set_font('Helvetica', '', 9)
        self.set_text_color(*self.GRAY)
        self.cell(0, 6, 'https://map-scrapper-five.vercel.app', align='C')

    def new_page(self):
        self.add_page()
        self.set_fill_color(*self.BG)
        self.rect(0, 0, 210, 297, 'F')
        self.set_fill_color(*self.GREEN)
        self.rect(0, 0, 210, 3, 'F')
        self.set_y(15)

    def section_title(self, text):
        self.ln(6)
        self.set_font('Helvetica', 'B', 16)
        self.set_text_color(*self.GREEN)
        self.cell(0, 10, text, new_x='LMARGIN', new_y='NEXT')
        # underline
        self.set_draw_color(*self.GREEN)
        self.set_line_width(0.5)
        x = self.get_x()
        y = self.get_y()
        self.line(x, y, x + 60, y)
        self.ln(4)

    def sub_title(self, text):
        self.ln(3)
        self.set_font('Helvetica', 'B', 12)
        self.set_text_color(*self.YELLOW)
        self.cell(0, 8, text, new_x='LMARGIN', new_y='NEXT')
        self.ln(1)

    def body_text(self, text):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(*self.LIGHT_TEXT)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def code_block(self, text):
        self.set_fill_color(*self.DARK_CARD)
        self.set_font('Courier', '', 9)
        self.set_text_color(*self.GREEN)
        x = self.get_x()
        w = self.w - self.l_margin - self.r_margin
        lines = text.split('\n')
        block_h = len(lines) * 5 + 6
        # Check if we need a new page
        if self.get_y() + block_h > self.h - 20:
            self.new_page()
        y_start = self.get_y()
        self.rect(x, y_start, w, block_h, 'F')
        self.set_xy(x + 4, y_start + 3)
        for line in lines:
            if self.get_y() > self.h - 20:
                self.new_page()
                self.set_fill_color(*self.DARK_CARD)
            self.set_x(x + 4)
            self.cell(w - 8, 5, line, new_x='LMARGIN', new_y='NEXT')
        self.ln(4)

    def bullet(self, text, indent=10):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(*self.LIGHT_TEXT)
        x = self.l_margin + indent
        self.set_x(x)
        self.set_text_color(*self.GREEN)
        self.cell(5, 5.5, '-', new_x='RIGHT')
        self.set_text_color(*self.LIGHT_TEXT)
        self.multi_cell(self.w - x - self.r_margin - 7, 5.5, ' ' + text)
        self.ln(1)

    def numbered(self, num, text, indent=10):
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(*self.GREEN)
        x = self.l_margin + indent
        self.set_x(x)
        self.cell(8, 5.5, f'{num}.', new_x='RIGHT')
        self.set_font('Helvetica', '', 10)
        self.set_text_color(*self.LIGHT_TEXT)
        self.multi_cell(self.w - x - self.r_margin - 10, 5.5, ' ' + text)
        self.ln(1)

    def step_box(self, step_num, title, instructions):
        """A visually distinct step box for tutorials."""
        w = self.w - self.l_margin - self.r_margin
        # estimate height
        if self.get_y() + 30 > self.h - 25:
            self.new_page()
        self.set_fill_color(35, 35, 35)
        y_start = self.get_y()
        # Step number badge
        self.set_fill_color(*self.GREEN)
        self.set_font('Helvetica', 'B', 10)
        self.set_text_color(*self.BG)
        badge_w = 28
        self.cell(badge_w, 7, f'  Step {step_num}', fill=True, new_x='RIGHT')
        # Title
        self.set_font('Helvetica', 'B', 11)
        self.set_text_color(*self.WHITE)
        self.cell(0, 7, f'  {title}', new_x='LMARGIN', new_y='NEXT')
        self.ln(2)
        # Instructions
        for line in instructions:
            if line.startswith('[SCREENSHOT'):
                self.set_fill_color(40, 40, 40)
                self.set_font('Helvetica', 'I', 9)
                self.set_text_color(*self.YELLOW)
                sw = self.w - self.l_margin - self.r_margin - 10
                self.set_x(self.l_margin + 5)
                self.cell(sw, 18, line, fill=True, align='C', new_x='LMARGIN', new_y='NEXT')
                self.ln(2)
            elif line.startswith('CMD:'):
                self.code_block(line[4:].strip())
            else:
                self.bullet(line, indent=5)
        self.ln(4)

    def table_row(self, cols, widths, bold=False, header=False):
        if header:
            self.set_fill_color(*self.GREEN)
            self.set_text_color(*self.BG)
            self.set_font('Helvetica', 'B', 9)
        elif bold:
            self.set_fill_color(35, 35, 35)
            self.set_text_color(*self.WHITE)
            self.set_font('Helvetica', 'B', 9)
        else:
            self.set_fill_color(25, 25, 25)
            self.set_text_color(*self.LIGHT_TEXT)
            self.set_font('Helvetica', '', 9)
        for i, (col, w) in enumerate(zip(cols, widths)):
            self.cell(w, 7, f' {col}', border=0, fill=True, new_x='RIGHT')
        self.ln()


# ═══════════════════════════════════════════════════════
#  PDF 1: AI PROMPTS & PITCH TEMPLATES
# ═══════════════════════════════════════════════════════

def generate_prompts_pdf():
    pdf = StyledPDF()
    pdf.cover_page(
        'AI Prompts &\nPitch Templates',
        'Maps Lead Scraper Course\nComplete prompt library for building websites,\npitching clients, and closing deals - all for free.'
    )

    # ── PAGE: System Prompt ──
    pdf.new_page()
    pdf.section_title('1. AI Course System Prompt')
    pdf.body_text(
        'Paste this into Claude Projects or any AI system prompt. It turns the AI into your '
        'full-stack assistant that qualifies leads, builds websites, writes pitch emails, and '
        'guides deployment - all from your scraped Maps data.'
    )
    pdf.sub_title('The Prompt')
    pdf.code_block(
        'You are an expert freelance web developer and business\n'
        'outreach consultant helping students build a profitable\n'
        'local business web design service from scratch - with\n'
        'zero upfront cost.\n'
        '\n'
        '## CONTEXT\n'
        'The student has used Maps Lead Scraper (a Chrome\n'
        'extension) to extract local business leads from Google\n'
        'Maps. Each lead includes: business name, address, phone,\n'
        'website (or lack of one), email, ratings, reviews, and\n'
        'social media links.\n'
        '\n'
        'The student\'s goal is to identify businesses that either\n'
        'have NO website or have a poor/outdated website, then\n'
        'build a modern, professional website for them using only\n'
        'free tools, and pitch it to win them as a paying client.'
    )

    pdf.new_page()
    pdf.sub_title('System Prompt (continued)')
    pdf.code_block(
        '## YOUR ROLE\n'
        'When given a business name, niche, and location (or a\n'
        'CSV of scraped leads), you will:\n'
        '\n'
        '### 1. LEAD QUALIFICATION\n'
        '- Analyze leads and prioritize businesses that:\n'
        '  - Have no website at all (highest priority)\n'
        '  - Have an outdated, non-mobile-friendly website\n'
        '  - Have good reviews (4+ stars) but weak presence\n'
        '  - Are in high-value niches (dental, legal, plumbing,\n'
        '    real estate, restaurants, salons, clinics)\n'
        '- Score each lead as HOT / WARM / COLD with reasoning\n'
        '\n'
        '### 2. WEBSITE CREATION\n'
        '- Pure HTML + CSS + JS (no frameworks needed)\n'
        '- Mobile-first, fast-loading, professional design\n'
        '- Sections: Hero+CTA, Services, Testimonials, Contact\n'
        '- SEO: meta tags, Open Graph, LocalBusiness schema\n'
        '- Contact form via Formspree (free tier)\n'
        '- Use actual business data from scraped lead\n'
        '\n'
        '### 3. DEPLOYMENT\n'
        '- Step-by-step Vercel deployment (free tier)\n'
        '- Git repo -> GitHub -> Vercel -> Live URL\n'
        '\n'
        '### 4. OUTREACH EMAILS\n'
        '- 3 templates: Direct Value, Consultative, Relationship\n'
        '- Under 150 words, personalized, no spam language\n'
        '- 3-email follow-up sequence (Day 3, 7, 14)\n'
        '\n'
        '### 5. PRICING GUIDANCE\n'
        '- Basic landing page: $200-500\n'
        '- Standard multi-page + SEO: $500-1500\n'
        '- Premium full site + maintenance: $1500-3000+\n'
        '- Monthly retainer: $50-150/mo'
    )

    # ── PAGE: Prompt 1 - Full Website Build ──
    pdf.new_page()
    pdf.section_title('2. Full Website Build Prompt')
    pdf.body_text('Use this after you\'ve identified a HOT lead. Fill in the placeholders from your CSV export.')
    pdf.code_block(
        'Build a complete, modern, mobile-first website for:\n'
        '\n'
        'Business Name: {{BUSINESS_NAME}}\n'
        'Niche: {{NICHE}}\n'
        'Address: {{ADDRESS}}\n'
        'Phone: {{PHONE}}\n'
        'Email: {{EMAIL}}\n'
        'Current Website: {{CURRENT_WEBSITE}}\n'
        'Google Rating: {{RATING}} ({{REVIEW_COUNT}} reviews)\n'
        'Hours: {{BUSINESS_HOURS}}\n'
        'Top Google Reviews: {{TOP_3_REVIEWS}}\n'
        '\n'
        'Requirements:\n'
        '- Single or multi-page (judge based on niche)\n'
        '- Hero section with strong CTA\n'
        '- About / Services tailored to {{NICHE}}\n'
        '- Testimonials using real Google reviews above\n'
        '- Contact form (Formspree - free tier)\n'
        '- Embedded Google Map of their location\n'
        '- Footer with address, phone, email, socials\n'
        '- SEO: meta tags, Open Graph, LocalBusiness schema\n'
        '- Mobile-first, fast, no heavy frameworks\n'
        '- Color scheme matching {{NICHE}} aesthetic\n'
        '- All files ready to deploy to Vercel\n'
        '\n'
        'Output: Complete index.html, styles.css, and any JS.'
    )

    # ── PAGE: Prompt 2 - Website Audit + Emails ──
    pdf.new_page()
    pdf.section_title('3. Website Audit & Pitch Emails')
    pdf.body_text('This prompt audits their current site and generates 3 ready-to-send cold emails plus follow-ups.')
    pdf.code_block(
        'I scraped this business from Google Maps:\n'
        '\n'
        'Business Name: {{BUSINESS_NAME}}\n'
        'Niche: {{NICHE}}\n'
        'Location: {{CITY}}, {{STATE/COUNTRY}}\n'
        'Current Website: {{CURRENT_WEBSITE}}\n'
        'Google Rating: {{RATING}} ({{REVIEW_COUNT}} reviews)\n'
        'Phone: {{PHONE}} | Email: {{EMAIL}}\n'
        '\n'
        'Audit their website and generate:\n'
        '\n'
        '1. Bullet list of 3-5 specific problems\n'
        '\n'
        '2. Three cold outreach emails:\n'
        '\n'
        'EMAIL A - "I Already Built You a New Website"\n'
        '  Subject + body (under 120 words)\n'
        '  Link demo site: {{DEMO_URL}}\n'
        '  CTA: reply or book a 5-min call\n'
        '\n'
        'EMAIL B - "Quick Audit of Your Website"\n'
        '  Mention 2 specific issues from audit\n'
        '  Offer free mockup. CTA: reply\n'
        '\n'
        'EMAIL C - "Helping {{CITY}} Businesses"\n'
        '  Local/community angle\n'
        '  Mention their Google reviews as potential\n'
        '\n'
        '3. Follow-up sequence (Day 3, 7, 14)\n'
        '   Each under 80 words\n'
        '\n'
        'Rules: No spam. Conversational, direct, specific.\n'
        'Use their business name + niche throughout.'
    )

    # ── PAGE: Prompt 3 - Landing Page ──
    pdf.new_page()
    pdf.section_title('4. Niche-Specific Landing Page')
    pdf.body_text('For leads that need a focused, high-converting single page.')
    pdf.code_block(
        'Create a high-converting landing page for:\n'
        '\n'
        'Business: {{BUSINESS_NAME}}\n'
        'Type: {{NICHE}}\n'
        'Location: {{CITY}}\n'
        'USP: {{USP_OR_BEST_REVIEW}}\n'
        'Target Customer: {{TARGET_AUDIENCE}}\n'
        '\n'
        'The page should:\n'
        '- Headline addressing customer pain point\n'
        '- "Why Choose {{BUSINESS_NAME}}" with 3-4 benefits\n'
        '- Show {{RATING}}-star rating with {{REVIEW_COUNT}}\n'
        '- Feature best review: "{{BEST_REVIEW_TEXT}}"\n'
        '- Sticky CTA button (Call Now / Book / Free Quote)\n'
        '- Trust badges (Google rating, locally owned)\n'
        '- FAQ section with 4-5 niche-specific questions\n'
        '- Clean HTML + CSS, deployable to Vercel'
    )

    # ── PAGE: Prompt 4 - Bulk Qualification ──
    pdf.section_title('5. Bulk Lead Qualification')
    pdf.body_text('Paste your entire CSV export to prioritize which businesses to pitch first.')
    pdf.code_block(
        'Here are {{COUNT}} businesses I scraped from\n'
        'Google Maps in {{CITY}} for "{{SEARCH_QUERY}}":\n'
        '\n'
        '{{PASTE_CSV_DATA}}\n'
        '\n'
        'For each business, return a table with:\n'
        '| Name | Website? | Quality | Rating | Priority |\n'
        '\n'
        'HOT = No website OR terrible site + good reviews\n'
        'WARM = Outdated website + decent reviews\n'
        'COLD = Good website already OR low reviews\n'
        '\n'
        'List top 5 to pitch first with one-line angle.'
    )

    # ── PAGE: Prompt 5 - Pitch Deck ──
    pdf.new_page()
    pdf.section_title('6. Full Pitch Deck')
    pdf.body_text('For high-value leads - generates a complete personalized pitch document.')
    pdf.code_block(
        'Create a personalized pitch document for:\n'
        '\n'
        'Business: {{BUSINESS_NAME}}\n'
        'Niche: {{NICHE}}\n'
        'Location: {{CITY}}\n'
        'Current Website: {{CURRENT_WEBSITE}} (or "None")\n'
        'Rating: {{RATING}} / {{REVIEW_COUNT}} reviews\n'
        'Top Competitor: {{COMPETITOR_WEBSITE}}\n'
        '\n'
        'Generate:\n'
        '1. Problem statement (why they lose customers)\n'
        '2. What their new site would look like\n'
        '3. Comparison: current vs. what we build\n'
        '4. Pricing options:\n'
        '   Starter: Landing page - $300\n'
        '   Pro: Full site + SEO - $800\n'
        '   Premium: Full + maintenance - $1500+$100/mo\n'
        '5. ROI calculation\n'
        '6. Clear next step CTA\n'
        '\n'
        'Format as clean HTML for sharing as link or PDF.'
    )

    # ── PAGE: Placeholder Reference ──
    pdf.new_page()
    pdf.section_title('7. Placeholder Quick Reference')
    pdf.body_text('Map these placeholders to columns in your Maps Lead Scraper CSV export:')
    pdf.ln(2)
    widths = [65, 55, 60]
    pdf.table_row(['PLACEHOLDER', 'CSV COLUMN', 'EXAMPLE'], widths, header=True)
    rows = [
        ('{{BUSINESS_NAME}}', 'Name', 'Joe\'s Plumbing'),
        ('{{NICHE}}', 'Your search query', 'plumber'),
        ('{{ADDRESS}}', 'Address', '123 Main St, NYC'),
        ('{{CITY}}', 'From Address', 'New York'),
        ('{{PHONE}}', 'Phone', '(555) 123-4567'),
        ('{{EMAIL}}', 'Email', 'info@joes.com'),
        ('{{CURRENT_WEBSITE}}', 'Website', 'joesplumbing.com'),
        ('{{RATING}}', 'Rating', '4.7'),
        ('{{REVIEW_COUNT}}', 'Reviews', '142'),
        ('{{BUSINESS_HOURS}}', 'Hours', 'Mon-Fri 8-6'),
        ('{{TOP_3_REVIEWS}}', 'Google Maps page', '(copy manually)'),
        ('{{DEMO_URL}}', 'Your Vercel URL', 'joes.vercel.app'),
    ]
    for r in rows:
        pdf.table_row(list(r), widths)

    pdf.ln(8)
    pdf.section_title('Workflow Summary')
    pdf.numbered(1, 'Scrape leads with Maps Lead Scraper')
    pdf.numbered(2, 'Open CSV - identify businesses with no/bad websites + good reviews')
    pdf.numbered(3, 'Use Prompt #5 (Bulk Qualification) to prioritize HOT leads')
    pdf.numbered(4, 'Use Prompt #2 (Full Website Build) to create their site in Claude')
    pdf.numbered(5, 'Deploy to Vercel for free (see Setup Tutorial PDF)')
    pdf.numbered(6, 'Use Prompt #3 (Audit + Emails) to generate personalized pitch')
    pdf.numbered(7, 'Send Email A with the live demo link')
    pdf.numbered(8, 'Follow up on Day 3, 7, 14 if no reply')
    pdf.numbered(9, 'Close the deal - deliver the site, collect payment')

    path = os.path.join(OUTPUT_DIR, 'AI_Prompts_and_Pitch_Templates.pdf')
    pdf.output(path)
    print(f'[OK] {path}')


# ═══════════════════════════════════════════════════════
#  PDF 2: BEGINNER SETUP TUTORIAL
# ═══════════════════════════════════════════════════════

def generate_tutorial_pdf():
    pdf = StyledPDF()
    pdf.cover_page(
        'Beginner Setup\nTutorial',
        'Maps Lead Scraper Course\n\nComplete guide to install VS Code, Git, Node.js,\nGitHub, and deploy websites to Vercel for FREE.'
    )

    # ── Table of Contents ──
    pdf.new_page()
    pdf.section_title('Table of Contents')
    toc = [
        ('1', 'Software Requirements Overview'),
        ('2', 'Install VS Code (Code Editor)'),
        ('3', 'Install Git (Version Control)'),
        ('4', 'Install Node.js (JavaScript Runtime)'),
        ('5', 'Create a GitHub Account'),
        ('6', 'Create a Vercel Account'),
        ('7', 'Build & Deploy Your First Website'),
        ('8', 'Quick Reference Commands'),
    ]
    for num, title in toc:
        pdf.set_font('Helvetica', '', 11)
        pdf.set_text_color(*pdf.GREEN)
        pdf.cell(10, 8, num, new_x='RIGHT')
        pdf.set_text_color(*pdf.LIGHT_TEXT)
        pdf.cell(0, 8, f'  {title}', new_x='LMARGIN', new_y='NEXT')

    # ── Section 1: Requirements ──
    pdf.new_page()
    pdf.section_title('1. Software Requirements Overview')
    pdf.body_text(
        'Everything in this tutorial is 100% FREE. Here\'s what you\'ll install:'
    )
    pdf.ln(2)
    widths = [45, 65, 70]
    pdf.table_row(['SOFTWARE', 'PURPOSE', 'DOWNLOAD URL'], widths, header=True)
    sw_rows = [
        ('VS Code', 'Code editor', 'code.visualstudio.com'),
        ('Git', 'Version control', 'git-scm.com'),
        ('Node.js', 'Run JavaScript', 'nodejs.org'),
        ('GitHub', 'Host your code', 'github.com'),
        ('Vercel', 'Free hosting', 'vercel.com'),
        ('Chrome', 'Extension + testing', 'google.com/chrome'),
    ]
    for r in sw_rows:
        pdf.table_row(list(r), widths)

    pdf.ln(6)
    pdf.sub_title('System Requirements')
    pdf.bullet('Windows 10/11, macOS 10.15+, or Linux')
    pdf.bullet('4 GB RAM minimum (8 GB recommended)')
    pdf.bullet('2 GB free disk space')
    pdf.bullet('Internet connection')

    # ── Section 2: VS Code ──
    pdf.new_page()
    pdf.section_title('2. Install VS Code')
    pdf.body_text('VS Code is a free code editor by Microsoft. It\'s where you\'ll write all your HTML, CSS, and JavaScript.')

    pdf.step_box(1, 'Download VS Code', [
        'Go to https://code.visualstudio.com',
        'Click the big blue "Download" button for your OS',
        '[SCREENSHOT: VS Code download page with Download button highlighted]',
    ])
    pdf.step_box(2, 'Run the Installer', [
        'Open the downloaded file (VSCodeSetup-x64.exe on Windows)',
        'Accept the license agreement',
        'IMPORTANT: Check "Add to PATH" option',
        'IMPORTANT: Check "Add Open with Code" to context menu',
        'Click Install and wait for completion',
        '[SCREENSHOT: VS Code installer with PATH checkbox highlighted]',
    ])
    pdf.step_box(3, 'Verify Installation', [
        'Open VS Code from Start Menu or Desktop',
        'Open the built-in terminal: press Ctrl + ` (backtick)',
        'Type this command to verify:',
        'CMD: code --version',
        'You should see a version number like 1.95.0',
        '[SCREENSHOT: VS Code open with terminal showing version]',
    ])
    pdf.step_box(4, 'Install Recommended Extensions', [
        'Click the Extensions icon in the left sidebar (or Ctrl+Shift+X)',
        'Search and install these free extensions:',
        '  - Live Server (by Ritwick Dey) - preview sites locally',
        '  - Prettier (by Prettier) - auto-format your code',
        '  - HTML CSS Support - autocomplete for web dev',
        '[SCREENSHOT: VS Code Extensions marketplace with Live Server]',
    ])

    # ── Section 3: Git ──
    pdf.new_page()
    pdf.section_title('3. Install Git')
    pdf.body_text('Git tracks changes to your code. You need it to push code to GitHub and deploy on Vercel.')

    pdf.step_box(1, 'Download Git', [
        'Go to https://git-scm.com/downloads',
        'Click "Download for Windows" (or your OS)',
        '[SCREENSHOT: Git download page]',
    ])
    pdf.step_box(2, 'Run the Installer', [
        'Open the downloaded Git installer',
        'Use ALL default settings - just click Next through everything',
        'The only change: select "Use Visual Studio Code as default editor"',
        'Click Install',
        '[SCREENSHOT: Git installer with VS Code editor option selected]',
    ])
    pdf.step_box(3, 'Verify & Configure Git', [
        'Open VS Code terminal (Ctrl + `) and run:',
        'CMD: git --version',
        'You should see something like: git version 2.44.0',
        'Now set your identity (replace with your name and email):',
        'CMD: git config --global user.name "Your Name"',
        'CMD: git config --global user.email "your@email.com"',
        '[SCREENSHOT: Terminal showing git version and config commands]',
    ])

    # ── Section 4: Node.js ──
    pdf.new_page()
    pdf.section_title('4. Install Node.js')
    pdf.body_text('Node.js lets you run JavaScript outside the browser. Some tools and Vercel CLI need it.')

    pdf.step_box(1, 'Download Node.js', [
        'Go to https://nodejs.org',
        'Click the LTS (Long Term Support) version - this is the stable one',
        'Do NOT pick the "Current" version',
        '[SCREENSHOT: nodejs.org with LTS download button highlighted]',
    ])
    pdf.step_box(2, 'Run the Installer', [
        'Open the downloaded .msi file',
        'Accept defaults, click Next through everything',
        'Make sure "Add to PATH" is checked',
        'Click Install',
        '[SCREENSHOT: Node.js installer with PATH option]',
    ])
    pdf.step_box(3, 'Verify Installation', [
        'Close and reopen VS Code terminal, then run:',
        'CMD: node --version',
        'CMD: npm --version',
        'You should see version numbers for both',
        '[SCREENSHOT: Terminal showing node and npm versions]',
    ])

    # ── Section 5: GitHub ──
    pdf.new_page()
    pdf.section_title('5. Create a GitHub Account')
    pdf.body_text('GitHub stores your code online for free. Vercel reads from GitHub to deploy your sites.')

    pdf.step_box(1, 'Sign Up', [
        'Go to https://github.com/signup',
        'Enter your email, create a password, choose a username',
        'Complete the verification puzzle',
        'Choose the FREE plan (don\'t pay for anything)',
        '[SCREENSHOT: GitHub signup page]',
    ])
    pdf.step_box(2, 'Create Your First Repository', [
        'Click the green "New" button (top left) or go to github.com/new',
        'Repository name: my-first-website',
        'Select "Public"',
        'Check "Add a README file"',
        'Click "Create repository"',
        '[SCREENSHOT: GitHub new repository form filled out]',
    ])
    pdf.step_box(3, 'Connect VS Code to GitHub', [
        'In VS Code terminal, clone the repo:',
        'CMD: git clone https://github.com/YOUR-USERNAME/my-first-website.git',
        'CMD: cd my-first-website',
        'When prompted, sign in to GitHub via the browser popup',
        'You\'re now connected. Any code you push will appear on GitHub.',
        '[SCREENSHOT: VS Code terminal after successful git clone]',
    ])

    # ── Section 6: Vercel ──
    pdf.new_page()
    pdf.section_title('6. Create a Vercel Account')
    pdf.body_text('Vercel hosts your websites for free with instant deploys from GitHub. No server setup needed.')

    pdf.step_box(1, 'Sign Up with GitHub', [
        'Go to https://vercel.com/signup',
        'Click "Continue with GitHub" (easiest method)',
        'Authorize Vercel to access your GitHub',
        'Choose the "Hobby" plan (FREE - do not enter payment info)',
        '[SCREENSHOT: Vercel signup page with GitHub option]',
    ])
    pdf.step_box(2, 'Import Your Repository', [
        'After signup, you\'ll see the Vercel dashboard',
        'Click "Add New..." > "Project"',
        'Select "Import Git Repository"',
        'Find "my-first-website" and click "Import"',
        'Leave all settings as default',
        'Click "Deploy"',
        '[SCREENSHOT: Vercel import repository screen]',
    ])
    pdf.step_box(3, 'Your Site is Live!', [
        'Vercel will build and deploy in ~30 seconds',
        'You\'ll get a free URL like: my-first-website.vercel.app',
        'Every time you push code to GitHub, Vercel auto-deploys!',
        'Share this URL with potential clients as their demo site',
        '[SCREENSHOT: Vercel successful deployment with live URL]',
    ])

    # ── Section 7: Build & Deploy ──
    pdf.new_page()
    pdf.section_title('7. Build & Deploy Your First Website')
    pdf.body_text('Now let\'s put it all together. You\'ll create a website for a scraped lead and deploy it live.')

    pdf.step_box(1, 'Create the Website Files', [
        'Open VS Code > File > Open Folder > select "my-first-website"',
        'Create a new file: index.html',
        'Use the AI prompt from the Prompts PDF to generate the full site',
        'Paste the generated code into index.html',
        'If there\'s CSS, create styles.css in the same folder',
        '[SCREENSHOT: VS Code with index.html open showing generated code]',
    ])
    pdf.step_box(2, 'Preview Locally', [
        'Right-click index.html in VS Code',
        'Select "Open with Live Server"',
        'Your browser opens with a live preview of the site!',
        'Make any tweaks - the preview updates automatically',
        '[SCREENSHOT: Browser showing the live preview of the business website]',
    ])
    pdf.step_box(3, 'Push to GitHub', [
        'In VS Code terminal, run these commands:',
        'CMD: git add .',
        'CMD: git commit -m "Add website for [Business Name]"',
        'CMD: git push',
        'Your code is now on GitHub!',
        '[SCREENSHOT: Terminal showing successful git push]',
    ])

    pdf.new_page()
    pdf.step_box(4, 'Auto-Deploy on Vercel', [
        'Vercel detects the push automatically',
        'Go to vercel.com/dashboard to see the deployment',
        'In ~30 seconds, your site is live!',
        'Copy the URL (e.g., my-first-website.vercel.app)',
        'This is the demo link you\'ll send in your pitch email',
        '[SCREENSHOT: Vercel dashboard showing successful deployment]',
    ])
    pdf.step_box(5, 'For Each New Client', [
        'Create a new GitHub repo for each business',
        'Or create folders and push to the same repo',
        'Import each new repo into Vercel for free hosting',
        'Each client gets their own .vercel.app URL',
        'When they pay, connect their custom domain in Vercel settings',
    ])

    # ── Section 8: Quick Reference ──
    pdf.new_page()
    pdf.section_title('8. Quick Reference Commands')
    pdf.body_text('Keep this page handy. These are the only commands you need:')

    pdf.sub_title('Git Commands')
    pdf.code_block(
        '# Check status of your files\n'
        'git status\n'
        '\n'
        '# Stage all changes\n'
        'git add .\n'
        '\n'
        '# Commit with a message\n'
        'git commit -m "your message here"\n'
        '\n'
        '# Push to GitHub (triggers Vercel deploy)\n'
        'git push\n'
        '\n'
        '# Clone a repo\n'
        'git clone https://github.com/USER/REPO.git\n'
        '\n'
        '# Create a new branch\n'
        'git checkout -b new-branch-name'
    )

    pdf.sub_title('New Project Workflow')
    pdf.code_block(
        '# 1. Create repo on github.com/new\n'
        '# 2. Clone it locally:\n'
        'git clone https://github.com/YOU/REPO.git\n'
        'cd REPO\n'
        '\n'
        '# 3. Add your website files (from AI)\n'
        '# 4. Push to GitHub:\n'
        'git add .\n'
        'git commit -m "Initial website"\n'
        'git push\n'
        '\n'
        '# 5. Import repo in Vercel dashboard\n'
        '# 6. Done! Site is live at REPO.vercel.app'
    )

    pdf.sub_title('VS Code Shortcuts')
    pdf.ln(2)
    widths2 = [75, 105]
    pdf.table_row(['SHORTCUT', 'ACTION'], widths2, header=True)
    shortcuts = [
        ('Ctrl + `', 'Open/close terminal'),
        ('Ctrl + Shift + X', 'Open Extensions'),
        ('Ctrl + S', 'Save file'),
        ('Ctrl + Shift + P', 'Command Palette (search anything)'),
        ('Ctrl + P', 'Quick open file by name'),
        ('Alt + Shift + F', 'Format/prettify code'),
        ('Ctrl + /','Toggle comment'),
        ('Ctrl + B', 'Toggle sidebar'),
    ]
    for s in shortcuts:
        pdf.table_row(list(s), widths2)

    pdf.ln(8)
    pdf.sub_title('Troubleshooting')
    pdf.bullet('"git is not recognized" - Restart VS Code after installing Git, or reinstall with "Add to PATH"')
    pdf.bullet('"node is not recognized" - Same fix: restart VS Code or reinstall Node.js with PATH option')
    pdf.bullet('"Permission denied" on git push - Run: git remote set-url origin https://github.com/USER/REPO.git')
    pdf.bullet('Vercel deploy fails - Check that index.html is in the root folder, not inside a subfolder')
    pdf.bullet('Live Server not working - Make sure the Live Server extension is installed and you right-click the HTML file')

    path = os.path.join(OUTPUT_DIR, 'Beginner_Setup_Tutorial.pdf')
    pdf.output(path)
    print(f'[OK] {path}')


# ═══════════════════════════════════════════════════════
if __name__ == '__main__':
    generate_prompts_pdf()
    generate_tutorial_pdf()
    print('\nDone! Both PDFs generated.')
