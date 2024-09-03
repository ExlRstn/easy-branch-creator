import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, getClient, IGlobalMessagesService, IHostNavigationService, IProjectInfo } from "azure-devops-extension-api";
import { WorkItemTrackingRestClient, WorkItemExpand, WorkItemRelation } from "azure-devops-extension-api/WorkItemTracking";
import { GitRestClient } from "azure-devops-extension-api/Git";
import { StorageService } from "./storage-service";
import { Tokenizer } from "./tokenizer";
import { JsonPatchOperation, Operation } from "azure-devops-extension-api/WebApi";
import SettingsDocument from "./settingsDocument";

export class BranchCreator {

    public async createBranch(workItemId: number, repositoryId: string, sourceBranchName: string, project: IProjectInfo, gitBaseUrl: string): Promise<void> {
        const navigationService = await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
        const globalMessagesSvc = await SDK.getService<IGlobalMessagesService>(CommonServiceIds.GlobalMessagesService);
        const gitRestClient = getClient(GitRestClient);
        const workItemTrackingRestClient = getClient(WorkItemTrackingRestClient);
        const storageService = new StorageService();
        const settingsDocument = await storageService.getSettings();

        const repository = await gitRestClient.getRepository(repositoryId, project.name);

        const branchName = await this.getBranchName(workItemTrackingRestClient, settingsDocument, workItemId, project.name, sourceBranchName);
        const branchUrl = `${gitBaseUrl}/${repository.name}?version=GB${encodeURI(branchName)}`;

        if (await this.branchExists(gitRestClient, repositoryId, project.name, branchName)) {
            console.info(`Branch ${branchName} aready exists in repository ${repository.name}`);

            globalMessagesSvc.addToast({
                duration: 3000,
                message: `Branch ${branchName} aready exists`,
                callToAction: "Open branch",
                onCallToActionClick: async () => {
                    navigationService.openNewWindow(branchUrl, "");
                }
            });
            return;
        }

        const branch = (await gitRestClient.getBranches(repositoryId, project.name)).find((x) => x.name === sourceBranchName);
        if (!branch) {
            console.warn(`Branch ${sourceBranchName} not found`);
            return;
        }

        await this.createRef(gitRestClient, repositoryId, branch.commit.commitId, branchName);
        await this.linkBranchToWorkItem(workItemTrackingRestClient, project.id, repositoryId, workItemId, branchName);
        await this.updateWorkItemState(workItemTrackingRestClient, settingsDocument, project.id, workItemId);
        console.log(`Branch ${branchName} created in repository ${repository.name}`);

        globalMessagesSvc.addToast({
            duration: 3000,
            message: `Branch ${branchName} created`
        });

        navigationService.openNewWindow(branchUrl, "");
    }

    //public async getBranchName(workItemTrackingRestClient: WorkItemTrackingRestClient, settingsDocument: SettingsDocument, workItemId: number, project: string, sourceBranchName: string): Promise<string> {
    //    const workItem = await workItemTrackingRestClient.getWorkItem(workItemId, project, undefined, undefined, WorkItemExpand.Fields);
    //    const workItemType = workItem.fields["System.WorkItemType"];

    //    let branchNameTemplate = settingsDocument.defaultBranchNameTemplate;
    //    if (workItemType in settingsDocument.branchNameTemplates && settingsDocument.branchNameTemplates[workItemType].isActive) {
    //        branchNameTemplate = settingsDocument.branchNameTemplates[workItemType].value;
    //    }

    //    const tokenizer = new Tokenizer();
    //    const tokens = tokenizer.getTokens(branchNameTemplate);

    //    let branchName = branchNameTemplate;
    //    tokens.forEach((token) => {
    //        let workItemFieldName = token.replace('${', '').replace('}', '');
    //        let workItemFieldValue = ""
    //        if (workItemFieldName == "SourceBranchName") {
    //            workItemFieldValue = sourceBranchName
    //        }
    //        else if (workItemFieldName == "SourceBranchNameTail") {
    //            workItemFieldValue = sourceBranchName.replace(/.+\//, "")
    //        }
    //        else {
    //            workItemFieldValue = workItem.fields[workItemFieldName];
    //        }

    //        if (workItemFieldValue) {
    //            if (typeof workItemFieldValue.replace === 'function') {
    //                workItemFieldValue = workItemFieldValue.replace(/[^a-zA-Z0-9]/g, settingsDocument.nonAlphanumericCharactersReplacement);
    //            }
    //        }
    //        branchName = branchName.replace(token, workItemFieldValue);
    //    });

    //    if (settingsDocument.lowercaseBranchName) {
    //        branchName = branchName.toLowerCase();
    //    }

    //    return branchName;
    //}

    public async getBranchName(workItemTrackingRestClient: WorkItemTrackingRestClient, settingsDocument: SettingsDocument, workItemId: number, project: string, sourceBranchName: string): Promise<string> {
        try {


            console.log("Starting getBranchName method");

            // Fetch the work item
            const workItem = await workItemTrackingRestClient.getWorkItem(workItemId, project, undefined, undefined, WorkItemExpand.Fields);
            console.log("Fetched work item:", workItem);

            const workItemType = workItem.fields["System.WorkItemType"];
            console.log("Work item type:", workItemType);

            var workItemTypeName = '';
            var isTask = false;

            if (workItemType === 'Bug') {
                workItemTypeName = 'bugfix';
                console.log("Work item type is Bug, setting workItemTypeName to 'bugfix'");
            } else if (workItemType === 'Requirement') {
                workItemTypeName = 'feature';
                console.log("Work item type is Requirement, setting workItemTypeName to 'feature'");
            } else if (workItemType === 'Task') {
                const parentWorkItemId = Number(workItem.fields["System.Parent"]);
                console.log("Work item type is Task, parentWorkItemId:", parentWorkItemId);

                if (isNaN(parentWorkItemId) || parentWorkItemId === 0) {
                    workItemTypeName = workItemType;
                    console.log("Parent work item ID is invalid or zero, using work item type as workItemTypeName");
                } else {
                    const parentWorkItem = await workItemTrackingRestClient.getWorkItem(parentWorkItemId, project, undefined, undefined, WorkItemExpand.Fields);
                    console.log("Fetched parent work item:", parentWorkItem);

                    const parentWorkItemType = parentWorkItem.fields["System.WorkItemType"];
                    console.log("Parent work item type:", parentWorkItemType);

                    if (parentWorkItemType === 'Bug') {
                        workItemTypeName = 'bugfix';
                        console.log("Parent work item type is Bug, setting workItemTypeName to 'bugfix'");
                    } else if (parentWorkItemType === 'Requirement') {
                        workItemTypeName = 'feature';
                        console.log("Parent work item type is Requirement, setting workItemTypeName to 'feature'");
                    } else {
                        workItemTypeName = workItemType;
                        console.log("Parent work item type is neither Bug nor Requirement, using work item type as workItemTypeName");
                    }
                    isTask = true;
                }
            } else {
                workItemTypeName = workItemType;
            }

            var branchName = workItemTypeName;
            console.log("Initial branchName:", branchName);

            if (isTask) {
                branchName = branchName + "/" + workItem.fields["System.Parent"] + "/tasks/" + workItem.fields["System.Id"] + "/";
                console.log("Branch name for task:", branchName);
            } else {
                branchName = branchName + "/" + workItem.fields["System.Id"] + "/";
                console.log("Branch name for non-task:", branchName);
            }

            var title = workItem.fields["System.Title"].replace(/[^a-zA-Z0-9\s]+/g, ' ');
            console.log("Title after removing special characters:", title);

            title = title.trim();
            console.log("Title after trimming:", title);

            title = title.replace(/\s+/g, '-').toLowerCase();
            console.log("Title after replacing spaces with hyphens and converting to lower case:", title);

            branchName = branchName + title;
            console.log("Final branch name before truncation:", branchName);

            // Truncate while preserving whole words
            const words = title.split('-');
            console.log("Words from title:", words);

            let result = '';
            for (const word of words) {
                if (!word.trim()) continue;
                if ((result.length + word.length + 1) <= 50) {
                    if (result) result += '-';
                    result += word;
                    console.log("Adding word to result:", word, "Result so far:", result);
                } else {
                    console.log("Truncation limit reached, breaking loop");
                    break;
                }
            }
            console.log("Result after truncation:", result);

            result = result.toLowerCase();
            console.log("Result after lowercase:", result);

            let branchNameTemplate = settingsDocument.defaultBranchNameTemplate;
            console.log("Default branch name template:", branchNameTemplate);

            if (workItemType in settingsDocument.branchNameTemplates && settingsDocument.branchNameTemplates[workItemType].isActive) {
                branchNameTemplate = settingsDocument.branchNameTemplates[workItemType].value;
                console.log("Branch name template from settingsDocument:", branchNameTemplate);
            }

            console.log("Returning branch name:", result);
            return result;
        } catch (error) {
            console.error("An error occurred in getBranchName method:", error);
            return 'Wrong branch name';
        }
    }

    private async createRef(gitRestClient: GitRestClient, repositoryId: string, commitId: string, branchName: string): Promise<void> {
        const gitRefUpdate = {
            name: `refs/heads/${branchName}`,
            repositoryId: repositoryId,
            newObjectId: commitId,
            oldObjectId: "0000000000000000000000000000000000000000",
            isLocked: false
        };
        await gitRestClient.updateRefs([gitRefUpdate], repositoryId);
    }

    private async linkBranchToWorkItem(workItemTrackingRestClient: WorkItemTrackingRestClient, projectId: string, repositoryId: string, workItemId: number, branchName: string) {
        const branchRef = `${projectId}/${repositoryId}/GB${branchName}`;
        const relation: WorkItemRelation = {
            rel: "ArtifactLink",
            url: `vstfs:///Git/Ref/${encodeURIComponent(branchRef)}`,
            "attributes": {
                name: "Branch"
            }
        };
        const document: JsonPatchOperation[] = [
            {
                from: "",
                op: Operation.Add,
                path: "/relations/-",
                value: relation
            }
        ];
        await workItemTrackingRestClient.updateWorkItem(document, workItemId);
    }

    private async branchExists(gitRestClient: GitRestClient, repositoryId: string, project: string, branchName: string): Promise<boolean> {
        const branches = await gitRestClient.getRefs(repositoryId, project, `heads/${branchName}`);
        return branches.find((x) => x.name == `refs/heads/${branchName}`) !== undefined;
    }

    private async updateWorkItemState(workItemTrackingRestClient: WorkItemTrackingRestClient, settingsDocument: SettingsDocument, projectId: string, workItemId: number) {
        try {
            if (settingsDocument.updateWorkItemState) {
                const workItem = await workItemTrackingRestClient.getWorkItem(workItemId, projectId);
                const workItemType = workItem.fields["System.WorkItemType"];
                if (workItemType in settingsDocument.workItemState && settingsDocument.workItemState[workItemType].isActive) {
                    const newState = settingsDocument.workItemState[workItemType].value;
                    const document: JsonPatchOperation[] = [
                        {
                            from: "",
                            op: Operation.Add,
                            path: "/fields/System.State",
                            value: newState
                        }
                    ];
                    await workItemTrackingRestClient.updateWorkItem(document, workItemId);
                }
            }
        } catch (error) {
            console.warn("Update WorkItem State failed", error);
        }
    }
}