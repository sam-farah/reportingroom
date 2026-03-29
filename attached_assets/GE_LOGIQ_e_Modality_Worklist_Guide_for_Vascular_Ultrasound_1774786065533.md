# GE LOGIQ e Modality Worklist Guide for Vascular Ultrasound
**Author:** Manus AI

The GE LOGIQ e is a powerful portable ultrasound machine frequently used for vascular imaging. As you noted, there is indeed a function that allows patient data to be prepopulated on the machine for the day's scheduled exams. This feature is formally known as the **DICOM Modality Worklist (MWL)** [1]. Implementing a Modality Worklist eliminates the need for technologists to manually type in patient demographics, which saves time, streamlines the daily workflow, and drastically reduces data entry errors that can cause issues with billing or archiving [2].

This guide explains how the Modality Worklist functions, the infrastructure required to support it, how to configure it on your GE LOGIQ e, and the daily workflow for your sonographers.

## How the Modality Worklist Functions

The DICOM Modality Worklist acts as an electronic task manager that bridges your scheduling system and your ultrasound machine [3]. In a typical clinical environment, the workflow follows a specific sequence of automated steps. 

First, a patient is scheduled for a vascular ultrasound in the clinic's Electronic Medical Record (EMR), Hospital Information System (HIS), or Radiology Information System (RIS). When the appointment is created or the patient is checked in, the scheduling system generates an electronic message (typically an HL7 order message) containing all the relevant patient demographics and exam details [2]. 

This message is sent to a Worklist Server, which translates the information into the standard DICOM format. The GE LOGIQ e, connected to the same network, then queries this Worklist Server. The ultrasound machine downloads the list of scheduled patients for the day, including data points such as the Patient Name, Patient ID, Date of Birth, Gender, Accession Number, and the specific procedure scheduled [4]. When the sonographer is ready to perform the exam, they simply select the correct patient from the list on the ultrasound screen, and all data fields are instantly populated.

## Infrastructure Requirements

To successfully implement a Modality Worklist, your clinic must have three main components in place:

| Component | Description |
| :--- | :--- |
| **Scheduling System (EMR/RIS)** | The software where patient appointments and orders are originally entered. This system must be capable of exporting schedule data, usually via HL7 messages. |
| **Worklist Server (MWL Broker)** | A software application or server that receives the schedule from the EMR and hosts it in a DICOM-compliant format for the ultrasound to query [5]. |
| **Network Infrastructure** | A secure local area network (LAN) or Wi-Fi connection that allows the GE LOGIQ e to communicate with the Worklist Server. Both devices must have assigned IP addresses [6]. |

If your clinic does not currently have a dedicated Radiology Information System or a large-scale PACS, you can utilize standalone Worklist Server solutions. Options include dedicated software like the Sante Worklist Server, or cloud-based PACS solutions that include built-in worklist functionality, such as EMSOW or Tricefy [4] [7]. These systems can often integrate directly with your existing EMR to pull the daily schedule.

## Configuring the GE LOGIQ e

Setting up the Modality Worklist on the GE LOGIQ e requires configuring the machine's DICOM network settings to communicate with your Worklist Server. This is typically done by an IT professional or PACS administrator, but the general steps are as follows [6] [8]:

1. **Access the Utility Menu:** Press the **Utility** button on the control panel, then navigate to the **Connectivity** section.
2. **Set Up the Device:** Go to the **Device** tab. Here, you must add your Worklist Server as a new device by entering its specific IP Address.
3. **Configure the Service:** Navigate to the **Service** tab. From the "Destination Device" drop-down menu, select the server you just created.
4. **Add DICOM Worklist:** From the "Select Service" drop-down menu, choose **DICOM Worklist** and press **Add**. 
5. **Enter Server Details:** You will need to input the **AE Title** (Application Entity Title) and the **Port Number** of your Worklist Server. Note that the AE Title is case-sensitive and must match the server exactly.
6. **Set Search Criteria:** You can configure default search filters, such as setting the Modality to "US" (Ultrasound) and the Scheduled Date to "Today." This ensures the machine only downloads relevant vascular exams for the current day.
7. **Verify Connection:** Save your changes and press the **Verify** button. A "Smiley Face" icon typically indicates that the LOGIQ e has successfully communicated with the Worklist Server.

## Daily Workflow for the Sonographer

Once the Modality Worklist is configured and communicating with your scheduling system, the daily workflow for the sonographer becomes highly efficient [9]. 

At the start of an exam, the sonographer presses the **Patient** button on the LOGIQ e control panel to open the Patient Data Entry screen. Instead of typing in the fields, they select the **Worklist** option (often located on the left column or as a dedicated button on the screen). 

The machine will display the list of patients scheduled for that day. If the list is not current, the sonographer can press **Search** or **Update** to refresh the query against the server. The sonographer then highlights the correct patient for the vascular exam and selects them. The system will automatically populate the Patient Name, ID, Date of Birth, and the Accession Number. The sonographer can then exit the patient screen and immediately begin scanning.

By utilizing the DICOM Modality Worklist, your vascular ultrasound practice can ensure accurate patient identification, prevent duplicate records, and allow your sonographers to focus on imaging rather than administrative data entry.

***

### References
[1] EMSOW. "Setting Up Your Ultrasound System: Modality Worklist Configuration." EMSOW Blog. https://emsow.medium.com/setting-up-your-ultrasound-system-modality-worklist-configuration-d839edb30985
[2] Dicom Systems. "Understanding DICOM Modality Worklist (DMWL): Enhancing Radiology Workflow Efficiency." https://dcmsys.com/project/understanding-dicom-modality-worklist-dmwl-enhancing-radiology-workflow-efficiency/
[3] American College of Emergency Physicians. "Understanding IT Speak 101." EM Ultrasound Section Newsroom. https://www.acep.org/emultrasound/newsroom/may-2022/understanding-it-speak-101
[4] Tricefy. "Worklist." Tricefy Help Center. https://www.tricefy.help/help/worklist
[5] EMSOW. "Modality worklist — an automated solution for dispatching imaging studies." https://emsow.medium.com/modality-worklist-an-automated-solution-for-dispatching-imaging-studies-75475779908c
[6] ManualsLib. "Dicom Worklist Service; Worklist Setup - GE LOGIQ E9 Service Manual." https://www.manualslib.com/manual/1309336/Ge-Logiq-E9.html?page=175
[7] Santesoft. "Sante Worklist Server." https://santesoft.com/win/sante-worklist-server/sante-worklist-server.html
[8] Probo Medical. "Configuring DICOM on GE Logiq e and Vivid e ultrasounds." https://www.probomedical.com/learn/blog/configuring-dicom-ge-logiq-e-vivid-e-ultrasounds/
[9] GE Healthcare. "LOGIQ Series Quick Start." https://www.logiqclub.net/download/news/file/906
