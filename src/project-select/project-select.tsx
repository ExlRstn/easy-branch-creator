import * as React from "react";
import { getClient, IProjectInfo } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { EditableDropdown } from "azure-devops-ui/EditableDropdown";
import { DropdownSelection } from "azure-devops-ui/Utilities/DropdownSelection";
import { ObservableArray } from "azure-devops-ui/Core/Observable";
import { IListBoxItem } from "azure-devops-ui/ListBox";
import { ITableColumn, SimpleTableCell } from "azure-devops-ui/Table";
import { Icon } from "azure-devops-ui/Icon";

export interface IProjectSelectProps {
    organizationName?: string;
    onProjectChange: (newProjectId?: string) => void;
}

interface IProjectSelectState {
    ready: boolean;
}

export class ProjectSelect extends React.Component<IProjectSelectProps, IProjectSelectState> {
    private projects = new ObservableArray<IListBoxItem<string>>();
    private projectSelection = new DropdownSelection();

    constructor(props: { onProjectChange: (newProjectId?: string) => void }) {
        super(props);
        this.state = { ready: false };
    }

    public async componentDidMount() {
        console.log("ProjectSelect  componentDidMount");
        await this.loadProjects();

        this.setState(prevState => ({
            ...prevState,
            ready: true
        }));
    }

    public async componentDidUpdate(prevProps: IProjectSelectProps) {
        if (prevProps.organizationName !== this.props.organizationName) {
            await this.loadProjects();
        }
    }

    public render(): JSX.Element {
        return (
            <div className="flex-column">
                <label className="bolt-formitem-label body-m">Projects</label>
                <EditableDropdown<string>
                    disabled={!this.state.ready}
                    items={this.projects}
                    selection={this.projectSelection}
                    onValueChange={(item?: IListBoxItem<string>) => {
                        this.setSelectedProjectId(item?.data);
                    }}
                    renderItem={(rowIndex: number, columnIndex: number, tableColumn: ITableColumn<IListBoxItem<string>>, tableItem: IListBoxItem<string>) => {
                        return (
                            <SimpleTableCell
                                columnIndex={columnIndex}
                                key={tableItem.id}
                                tableColumn={tableColumn}
                            >
                                <div className="bolt-list-box-cell-container"
                                >
                                    <span className="bolt-list-cell-text">
                                        <span className="text-ellipsis body-m">
                                            <Icon iconName="GitLogo" />
                                            {tableItem.text}
                                        </span>
                                    </span>
                                </div>
                            </SimpleTableCell>
                        );
                    }}
                />
            </div>
        );
    }

    private async loadProjects() {
        console.log("ProjectSelect  loadProjects");
        if (!!!this.props.organizationName) {
            return;
        }
        const coreClient = getClient(CoreRestClient);
        const projects: IProjectInfo[] = await coreClient.getProjects();
        this.projects.push(...projects.map(t => { return { id: t.id, data: t.id, text: t.name } }));

        if (this.projects.length > 0) {
            this.setSelectedProjectId(projects[0].id);
            this.projectSelection.select(0);
        }
    }

    private setSelectedProjectId(projectId?: string) {
        this.props.onProjectChange(projectId);
    }
}