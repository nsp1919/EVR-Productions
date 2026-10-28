/**
 * Paste into a new Google Apps Script project and run createEvrClientForm.
 * Creates an unpublished Google Form owned by the account running this script.
 * No media uploads, emails, public sharing or external services are triggered.
 */
const EVR_FORM_TITLE = 'EVR Website - Business Details & One Drive Link';
// Separate keys create the shorter form without changing the old form or responses.
const EVR_FORM_ID_KEY = 'EVR_CLIENT_CONTENT_FORM_ID_V2';
const EVR_FORM_STATE_KEY = 'EVR_CLIENT_CONTENT_FORM_STATE_V2';

const EVR_PHOTO_SETS = [
  { title: 'Full wedding photos', count: 12, landscape: 7, portrait: 5 },
  { title: 'Pre-wedding photos', count: 12, landscape: 7, portrait: 5 },
  { title: 'Reception / engagement / sangeet photos', count: 12, landscape: 7, portrait: 5 },
  { title: 'Corporate / brand project photos', count: 6, landscape: 4, portrait: 2 },
  { title: 'Product / reels project photos', count: 6, landscape: 4, portrait: 2 },
  { title: 'Podcast / YouTube / creator project photos', count: 6, landscape: 4, portrait: 2 },
  { title: 'Team and studio photos', count: 6, detail: '3 individual team portraits + 2 team-working photos + 1 group or studio photo.' }
];

const EVR_VIDEO_SETS = [
  { title: 'Wedding showreel', count: 1, detail: '45-90 seconds.' },
  { title: 'Wedding / pre-wedding / event films', count: 3, detail: '1 wedding film + 1 pre-wedding film + 1 event film. Each film: minimum 1 minute, maximum 3 minutes.' },
  { title: 'Corporate showreel', count: 1, detail: '' },
  { title: 'Corporate project films', count: 3, detail: 'Three finished examples of your corporate work.' },
  { title: 'Vertical reels', count: 2, detail: 'Vertical-format videos.' },
  { title: 'YouTube production example', count: 1, detail: '' },
  { title: 'Podcast example', count: 1, detail: '' }
];

function createEvrClientForm() {
  const lock = LockService.getUserLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getUserProperties();
    const existingId = properties.getProperty(EVR_FORM_ID_KEY);
    if (existingId) {
      if (properties.getProperty(EVR_FORM_STATE_KEY) !== 'complete') {
        throw new Error(
          'An earlier setup did not finish. Do not publish that partial form. ' +
          'Inspect it at https://docs.google.com/forms/d/' + existingId + '/edit . ' +
          'To make a fresh form without deleting anything, paste this script into a NEW Apps Script project and run it there.'
        );
      }
      const existing = FormApp.openById(existingId);
      evrLogLinks_(existing);
      return existing.getEditUrl();
    }

    const form = FormApp.create(EVR_FORM_TITLE, false);
    properties.setProperty(EVR_FORM_ID_KEY, form.getId());
    properties.setProperty(EVR_FORM_STATE_KEY, 'building');
    console.log('Draft created. If setup fails, inspect this draft: ' + form.getEditUrl());

    form.setDescription(
      'Just two sections: fill in your business details, then read the content list and share ONE Google Drive folder link.\n\n' +
      'No price list is requested. The website will show: "Pricing will be discussed on a call."\n\n' +
      'No separate media questions or readiness checklists. Keep all photos, videos, logo and supporting information in one folder. ' +
      'Grant the website developer access directly; you do not need to make the folder public.'
    );
    form.setProgressBar(true);
    form.setShuffleQuestions(false);
    form.setCollectEmail(false);
    form.setLimitOneResponsePerUser(false);
    form.setPublishingSummary(false);
    form.setAllowResponseEdits(true);
    form.setConfirmationMessage(
      'Thank you. Your business details and Google Drive folder link have been received. ' +
      'You can add the remaining files to the same folder later. Keep the Edit response link in case you need to change the folder link. ' +
      'Pricing will be discussed on a call.'
    );

    evrBuildBusiness_(form);
    evrBuildContentList_(form);

    properties.setProperty(EVR_FORM_STATE_KEY, 'complete');
    evrLogLinks_(form);
    return form.getEditUrl();
  } finally {
    lock.releaseLock();
  }
}

function evrSection_(form, title, help, first) {
  const item = first ? form.addSectionHeaderItem() : form.addPageBreakItem();
  item.setTitle(title).setHelpText(help);
}

function evrText_(form, title, help, required, validation) {
  const item = form.addTextItem().setTitle(title).setRequired(Boolean(required));
  if (help) item.setHelpText(help);
  if (validation) item.setValidation(validation);
  return item;
}

function evrParagraph_(form, title, help, required) {
  return form.addParagraphTextItem()
    .setTitle(title).setHelpText(help || '').setRequired(Boolean(required));
}

function evrLink_(form, title, help) {
  const validation = FormApp.createTextValidation()
    .requireTextIsUrl().setHelpText('Paste a full web link beginning with https://, or leave this optional field blank.').build();
  return evrText_(form, title, help || 'Paste a full folder or file URL. Leave blank if not ready.', false, validation);
}

function evrPhotoDescription_(set) {
  return set.detail || (set.landscape + ' landscape photos + ' + set.portrait + ' portrait photos.');
}

function evrBuildBusiness_(form) {
  evrSection_(form, '1 / Business details and services',
    'Provide the business information and links to use on the website.', true);
  evrText_(form, 'Business / studio name', '', true);
  evrText_(form, 'Tagline', 'Leave blank if you do not use a tagline.', false);
  evrText_(form, 'WhatsApp number', 'Include the country code, for example +91. This is the business enquiry number.', true);
  const emailValidation = FormApp.createTextValidation().requireTextIsEmail()
    .setHelpText('Enter a valid business email address.').build();
  evrText_(form, 'Business email ID', 'The email address to use for website enquiries.', true, emailValidation);
  evrParagraph_(form, 'Studio address', 'Enter the address to display, or state that there is no public studio address.', true);
  evrLink_(form, 'Google Maps location link');
  evrParagraph_(form, 'Business timings', 'Working days and opening/closing times.', true);
  evrParagraph_(form, 'Cities and locations you cover', '', true);
  evrLink_(form, 'Instagram profile link');
  evrLink_(form, 'YouTube channel link');
  evrParagraph_(form, 'Business information', 'A short introduction to your business. Bullet points are fine.', true);
  evrParagraph_(form, 'Wedding service information', 'List the wedding services you actually offer. Do not include prices.', true);
  evrParagraph_(form, 'Corporate service information', 'List the brand, reels, YouTube and podcast services you actually offer. Do not include prices.', true);
}

function evrBuildContentList_(form) {
  evrSection_(form, '2 / Content needed - read this list and share one folder',
    'Nothing to fill category by category. Put the following content into ONE Google Drive folder, ' +
    'using subfolders if helpful. Paste that folder link at the bottom. You can add missing files to the same folder later.');
  form.addSectionHeaderItem().setTitle('Photographs needed - 60 total')
    .setHelpText(EVR_PHOTO_SETS.map(set =>
      set.title + ': ' + set.count + ' photos. ' + evrPhotoDescription_(set)).join('\n\n'));
  form.addSectionHeaderItem().setTitle('Finished videos needed - 12 total')
    .setHelpText(EVR_VIDEO_SETS.map(set =>
      set.title + ': ' + set.count + ' video(s). ' + set.detail).join('\n\n'));
  form.addSectionHeaderItem().setTitle('Also put these in the same folder')
    .setHelpText(
      'Logo file.\n\n' +
      'One document with information about 6 real projects: 3 wedding-side and 3 corporate-side. ' +
      'For each, give the project name, service, short description and matching media folder.\n\n' +
      '4-6 genuine customer reviews, with approved customer names, in the same document or a separate file.\n\n' +
      '2-4 video testimonials, only if available. These are additional to the 12 finished videos.\n\n' +
      'Please use original-quality files approved for website use. Quote-form options can be discussed on our call; no selection grids to complete here.'
    );
  evrLink_(form, 'One Google Drive folder link',
    'Keep ALL images, videos, logo and project/review information in one Google Drive folder and paste its link here. ' +
    'Grant the website developer access using their Google email; do not make private media public. ' +
    'The folder can be partly complete - add remaining files later.').setRequired(true);
}

function evrLogLinks_(form) {
  console.log('FORM READY - review the edit link before publishing.');
  console.log('EDIT LINK (owner only; do not send to the client): ' + form.getEditUrl());
  console.log('RESPONDER LINK (works after publishing and granting responder access): ' + form.getPublishedUrl());
  console.log('In Forms: review the form, Publish, set responder access for your client, then copy the responder link.');
  console.log('Responses remain in the form. Use the Responses tab to review them or optionally link a Google Sheet.');
}
