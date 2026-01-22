# Tenant Admin Guide

This guide covers administrative features available to tenant admins within MyWorkDay.

## Client Divisions Management

Divisions provide organizational structure within clients for finer-grained access control.

### Accessing Divisions

1. Navigate to **Clients** in the sidebar
2. Click on a client to open their profile
3. Click the **Divisions** tab

### Creating a Division

1. In the Divisions tab, click **New Division**
2. Fill in the required fields:
   - **Name**: A descriptive name (e.g., "Engineering", "Marketing")
   - **Description**: Optional additional context
   - **Color**: Choose a color for visual identification
   - **Active Status**: Toggle to enable/disable the division
3. Click **Create Division**

### Editing a Division

1. Click on any division card in the list
2. The division drawer opens with two tabs:
   - **Details**: Edit name, description, color, and active status
   - **Team**: Manage division membership
3. Make your changes and click **Save Changes**

### Managing Division Members

1. Open a division and go to the **Team** tab
2. Use the search box to find users
3. Check/uncheck users to add or remove them
4. Click **Save Members** to apply changes

### Division Visibility Rules

- **Tenant Admins**: See all divisions across all clients
- **Employees**: Only see divisions they are members of

### Best Practices

1. **Use descriptive names**: Choose clear, consistent naming conventions
2. **Keep divisions focused**: Each division should represent a distinct team or function
3. **Review regularly**: Periodically review division membership as teams change
4. **Use colors consistently**: Establish a color scheme for division types

## Related Documentation

- [Divisions Data Model](./DIVISIONS.md) - Technical details and API endpoints
- [Project Membership](../07-SECURITY/TENANT_DATA_VISIBILITY.md) - Access control rules
