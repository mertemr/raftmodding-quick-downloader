# Raft Mod Downloader (Tampermonkey)

This repository contains a Tampermonkey userscript that adds a quick download tool to the `raftmodding.com/mods` page.

## Script

- [raftmodding-quick-downloader.user.js](raftmodding-quick-downloader.user.js): The main userscript file that implements the quick download functionality.

## Installation

### Automatic Installation (Recommended)

1. Install Tampermonkey for Chrome/Edge/Firefox.
2. Click the button below to install the userscript:
> [![Install Raft Mod Downloader](https://img.shields.io/badge/Install%20Raft%20Mod%20Downloader-4CAF50?style=for-the-badge&logo=tampermonkey&logoColor=white)](https://raw.githubusercontent.com/mertemr/raftmodding-quick-downloader/main/raftmodding-quick-downloader.user.js)
3. After installation, navigate to `https://www.raftmodding.com/mods` to see the new features in action.

### Manual Installation
1. Install Tampermonkey for Chrome/Edge/Firefox.
2. Download the [raftmodding-quick-downloader.user.js](raftmodding-quick-downloader.user.js) file from this repository.
3. Open the downloaded file in a text editor and copy its contents.
4. Open the Tampermonkey dashboard by clicking the Tampermonkey icon in your browser and selecting `Dashboard`.
5. Click the `+` button to create a new userscript.
6. Paste the copied code into the editor and save the script.
7. Navigate to `https://www.raftmodding.com/mods` to see the new features in action.

## Features

- Adds a `Quick Download` button to each mod card.
- Opens the direct download link with a single click (bypassing the warning popup).
- Adds a `Quick Tools` panel at the top:
  - Compatibility filters (`up to date`, `untested`, `outdated`, etc.).
  - Type filters (based on the `This is a ... mod` information).
  - `Download Filtered` to bulk download visible mods.
  - `Stop` to halt bulk downloads.

## Notes

- Your browser may ask for permission when downloading multiple files from a single domain. Select `Allow` when prompted.
- Since mod type information is fetched asynchronously from detail pages, there may be a short loading time on the first load.
- If the site’s HTML structure changes, the selectors will need to be updated.
