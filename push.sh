#!/bin/bash

# Minimal Error Handling function
die() { echo -e "\033[1;31mError:\033[0m $*" >&2; exit 1; }

# Remove git history
rm -rf .git || die "Failed to remove git history."

# Initialize
git init || die "Failed to initialize repo."
git remote add origin https://github.com/SpreadiesInSpace/BraveSoftware || \
  die "Failed to set git remote."
git add . || die "Failed to add files."
git commit -m 'update Brave dots' || die "Commit failed."

# Set branch name from master to main then force push
git branch -m main  || die "Failed to set branch name to main."
git push -f -u origin main || die "Failed to push to repo."
